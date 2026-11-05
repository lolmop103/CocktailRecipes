# Login and session hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A global failed-login cooldown, one live session at a time, logout everywhere, a 14 day session lifetime and a graceful shutdown.

**Architecture:** A small in-memory `loginThrottle` module that `authService.login` consults before running scrypt; `sessionStore` gains `replaceAll` and `removeAll`; a `shutdown` helper wired from `index.ts`; a few client lines for the countdown and the new menu entry. No migration.

**Tech Stack:** Node 24, Express 5, better-sqlite3, vitest + supertest, React 19 + TanStack Query, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-login-session-hardening-design.md` (decisions 1 to 11, the behaviour sections and the Efficiency budget). Executors read it first.

## Global Constraints

- Constants (spec decision 1, in `server/src/config/limits.ts`): free attempts 3, cooldown 30 000 ms, idle reset 15 min, shutdown force 8 000 ms.
- `SESSION_TTL_DAYS` default 14, fixed from login, not sliding. No access/refresh tokens.
- Nothing is keyed on the client IP; the per-IP `loginFailures` limiter is removed, the read and write limiters stay.
- A wrong username, a wrong password and both wrong give the same 401 "Wrong username or password" and each runs scrypt once. A refused attempt runs it zero times.
- Logs never contain the IP, the typed username, the password or which field was wrong.
- No new dependency, no migration, wire types only in `packages/shared`.
- Commits: Conventional Commits, English, the owner's name only, no AI attribution. Hooks never bypassed.
- Never touch the owner's local edge, the test stack (`docker-compose-test.yml`, project `cocktailrecipes-test`) or the dev map. Any container check uses a throwaway project name, port and volume, removed afterwards.
- Gates per task: `pnpm verify`; at the end of each branch also `pnpm build` and `pnpm e2e`.

## Review Focus

1. Tests that log in more than once (the revoke on login of Task 5 ends the earlier session): the full server and e2e suites run in Task 5 and every failure is fixed in the test, not by weakening the rule.
2. Throttle state leaking between tests and between supertest apps (module-level state): reset in a shared `beforeEach` (Task 1).
3. A burst of parallel attempts and two attempts in the same millisecond: at most 3 reach scrypt (Tasks 1 and 2).
4. A 429 without `retryAfterSeconds` in the body (a proxy or Cloudflare answered): the client falls back to the message and shows no countdown (Task 4).
5. `logout-all` with a cookie for a session that is already gone, and called twice in a row: 401 then 401, never a 500 (Task 6).
6. Shutdown with a request still in flight, a second signal, and `closeDb` throwing: forced exit, immediate exit, exit 1 respectively (Task 7).

---

## Branch 1 — `feat/login-throttle` (from `develop`)

### Task 1: The throttle module

**Files:**

- Create: `server/src/lib/loginThrottle.ts`, `server/tests/loginThrottle.test.ts`, `server/tests/setup.ts`
- Modify: `server/src/config/limits.ts` (add `LOGIN_THROTTLE`), `server/vitest.config.ts` (`setupFiles: ['tests/setup.ts']`)

**Interfaces:**

- Produces: `LOGIN_THROTTLE = { freeAttempts: 3, cooldownMs: 30_000, idleResetMs: 900_000 } as const`.
- Produces: `type Admission = { ok: true; failures: number; cooldownSeconds: number } | { ok: false; retryAfterSeconds: number; firstRefusal: boolean }`.
- Produces: `loginThrottle.admit(now?: number): Admission`, `.succeed(): void`, `.reset(): void` (same as `succeed`, named for tests).
- `tests/setup.ts` calls `loginThrottle.reset()` in a global `beforeEach`.

- [ ] **Step 1: Write the failing tests** in `loginThrottle.test.ts`, fake clock passed as `now`: attempts at t=0, 1 s, 2 s all `ok` with `failures` 1, 2, 3 and `cooldownSeconds` 0, 0, 30; the 4th at t=3 s is `{ ok: false, retryAfterSeconds: 29, firstRefusal: true }`; a 5th at t=4 s is refused with `firstRefusal: false`; an attempt at t=32 s is `ok` with `failures` 4 and `cooldownSeconds` 30 and refused attempts did not extend the window (the window ended at 32 s, not later); `succeed()` after an attempt makes the next three `ok` again; 15 min (900 000 ms) after the last admitted attempt the state is reset (admitted attempt reports `failures` 1); `retryAfterSeconds` is rounded up and at least 1; 100 `admit` calls with the same `now` after a reset admit exactly 3.
- [ ] **Step 2: Run** `pnpm --filter cocktail-server exec vitest run tests/loginThrottle.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `loginThrottle.ts` as spec section "Throttle": state `failures`, `lastAttemptAt`, `blockedUntil`, `refusalReported`; `admit` follows steps 1 to 3 of the spec; a refusal sets `refusalReported` and returns `firstRefusal` true only the first time in a window; the module holds no timers. Add the constants and the global setup.
- [ ] **Step 4: Run** the new test and the whole server suite — Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): login throttle with a global cooldown`.

### Task 2: Throttle in `login`, the 429 shape

**Files:**

- Modify: `server/src/lib/errors.ts` (add `TooManyRequestsError`), `server/src/services/authService.ts`, `server/src/middleware/errorHandler.ts`, `packages/shared/src/errors.ts`, `server/tests/auth.test.ts`, `server/tests/errorHandler.test.ts`

**Interfaces:**

- Consumes: `loginThrottle.admit`, `.succeed` (Task 1).
- Produces: `class TooManyRequestsError extends AppError { status = 429; constructor(message: string, readonly retryAfterSeconds: number) }`.
- Produces: `ApiErrorBody.retryAfterSeconds?: number` in `packages/shared`; the error handler puts it in the body and sets `Retry-After` for a `TooManyRequestsError`, and does **not** write its generic "Request rejected" warn line for it (decision 10).

- [ ] **Step 1: Write the failing tests.** `auth.test.ts` (supertest, `Origin` set): after 3 wrong logins the 4th, even with the correct password, is 429 with body `{ status: 429, message, retryAfterSeconds }` (a whole number between 1 and 30), a `Retry-After` header equal to it, and the body is at most 200 bytes; the 5th is 429 too; a 400 (`{ username: '' }`) and a 403 (wrong `Origin`) after 3 wrong logins do not change the next outcome and are not 429; a correct login on the 3rd attempt resets (3 more wrong attempts are answered 401 again); with `vi.setSystemTime` 31 s later the correct password gives 204. `authService` unit tests with a spy on `verifyPassword`: wrong username, wrong password and both wrong each call it once and throw an identical `UnauthorizedError` message; 100 parallel `login` calls (Promise.all, same `now`) call it at most 3 times; a refused call calls it zero times. `errorHandler.test.ts`: a `TooManyRequestsError` produces the body and header and no logger call.
- [ ] **Step 2: Run** the three files — Expected: FAIL.
- [ ] **Step 3: Implement.** In `authService.login`: configured check (503) first, then `loginThrottle.admit(now)`; on refusal throw `TooManyRequestsError('Too many attempts — try again shortly', retryAfterSeconds)`; verify; on success `loginThrottle.succeed()`; the failure path is Task 3's log line. Extend `ApiErrorBody` and `bodyFor`.
- [ ] **Step 4: Run** the three files and `pnpm verify` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): refuse login attempts during the cooldown with a 429`.

### Task 3: Failed-login log lines; remove the per-IP limiter

**Files:**

- Modify: `server/src/services/authService.ts`, `server/src/middleware/rateLimits.ts`, `server/src/config/limits.ts`, `server/src/app.ts`, `server/tests/rateLimits.test.ts`, `server/tests/logger.test.ts` or a new `server/tests/loginLogging.test.ts`

**Interfaces:**

- Consumes: `Admission` (Task 1), `logger` (`server/src/lib/logger.ts`).
- Produces: a warn line `Login failed` with context `{ consecutiveFailures, cooldownSeconds }` per admitted failed attempt, and a warn line `Login refused during cooldown` with `{ retryAfterSeconds }` for the first refusal of a window only.
- Removes: `loginFailures` from `createRateLimiters`, `LOGIN_FAILURE_LIMIT`, its `app.use` line, the `skip` comment about login in the write limiter stays valid.

- [ ] **Step 1: Write the failing tests** (spy on `logger.warn`): a wrong login logs `Login failed` with `consecutiveFailures: 1`; the serialized call arguments contain neither the typed username, the typed password nor an address (use a distinctive username such as `probe-user-7` and password `probe-pass-7`, assert `JSON.stringify(calls)` lacks both and lacks `::ffff` and `127.0.0.1`); the same line for a wrong username and for a wrong password (no field named); five refused requests in one window produce exactly one `Login refused during cooldown` line. In `rateLimits.test.ts`: delete the `login limit` and `login limit — only wrong credentials count` blocks; add one test that 10 wrong logins from one IP are not answered by the limiter's message "Too many requests — try again in a moment" (the 429 message is the throttle's) and that read and write limits still apply (existing tests stay).
- [ ] **Step 2: Run** those files — Expected: FAIL.
- [ ] **Step 3: Implement** the two log lines in `authService` and remove the limiter, constant and wiring; update the comment in `limits.ts` ("failed logins are few" now refers to the throttle).
- [ ] **Step 4: Run** `pnpm verify` — Expected: PASS, coverage gate met.
- [ ] **Step 5: Commit** `feat(server): log failed logins without personal data; drop the per-IP login limiter`.

### Task 4: Client countdown

**Files:**

- Modify: `client/src/lib/http.ts`, `client/src/features/Auth/LoginPage.tsx`, `client/src/features/Auth/loginForm.ts`; Create: `client/src/features/Auth/hooks/useCountdown.ts`; Test: `client/tests/authUi.test.tsx`, `client/tests/useCountdown.test.ts`

**Interfaces:**

- Produces: `ApiError.retryAfterSeconds: number | undefined` (from the body, only when a finite number ≥ 1).
- Produces: `useCountdown(seconds: number | undefined): number` — remaining whole seconds, starts when `seconds` changes to a value ≥ 1, one 1 s interval only while remaining > 0, cleared at 0 and on unmount.

- [ ] **Step 1: Write the failing tests** (fake timers): `ApiError` reads `retryAfterSeconds` from a 429 body and leaves it undefined for a body without it, a negative or a non-number; `useCountdown(3)` yields 3, 2, 1, 0 after each second and `vi.getTimerCount()` is 0 after it ends and after unmount; in `LoginPage`, a 429 with `retryAfterSeconds: 30` shows "try again in 30 s" in the alert, disables the submit button, and after 30 s enables it again; a 429 without the field shows the server message and the button stays enabled; advancing a minute makes no `authApi` call.
- [ ] **Step 2: Run** `pnpm --filter cocktail-client exec vitest run tests/authUi.test.tsx tests/useCountdown.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** as specified; `loginErrorMessage` keeps returning the server message for a 429 and `LoginPage` appends the countdown text from the hook.
- [ ] **Step 4: Run** `pnpm verify`; `pnpm build` and record the gzipped main and login chunk sizes against `develop` (budget: main ≤ +1 KB, login ≤ +1 KB) — Expected: PASS and sizes within budget.
- [ ] **Step 5: Commit** `feat(client): show the login cooldown as a countdown`.

### Branch 1 close

- [ ] `pnpm e2e` green; `branch-reviewer` on the whole branch (security-sensitive); fix wave if needed; tell the owner before pushing; PR into `develop` with decisions, budget checks, deferred minors; `ci-watcher`.

---

## Branch 2 — `feat/session-revocation` (from `develop` after Branch 1 is merged)

### Task 5: Revoke on login, TTL 14 days

**Files:**

- Modify: `server/src/data/sessionStore.ts`, `server/src/services/authService.ts`, `server/src/config/env.ts` (default 14), `.env.example`, `README.md` (env table), `docs/deploy.md` (the `SESSION_TTL_DAYS=30` line), `server/tests/sessionStore.test.ts`, `server/tests/auth.test.ts`, `server/tests/env.test.ts`, and every test or e2e spec the full run shows depending on two live sessions

**Interfaces:**

- Produces: `sessionStore.replaceAll(tokenHash: string, credentialTag: string, createdAt: number, expiresAt: number): void` (delete all rows, insert one, one transaction) and `sessionStore.removeAll(): void` (used by Task 6).

- [ ] **Step 1: Write the failing tests.** `sessionStore`: after two `replaceAll` calls exactly one row remains and it is the second; `removeAll` leaves none; if the insert fails the delete is rolled back (insert a duplicate-key conflict inside the call path or spy so the second statement throws, then assert the old row is still there). `auth.test.ts`: two successful logins, the first token's `GET /api/auth/me` is `{ authenticated: false }` and the second's is authenticated; a wrong login does not revoke the live session; the `Max-Age` of the cookie is 14 × 86 400 s. `env.test.ts`: the default is 14 (rename `env_sessionTtlDefault_30` to `…_14`).
- [ ] **Step 2: Run** those files — Expected: FAIL.
- [ ] **Step 3: Implement** `replaceAll`/`removeAll` as prepared statements with `db.transaction`; `login` uses `replaceAll` (the existing `purgeExpired` becomes redundant when everything is replaced; remove the call and its test `login_purgesExpiredSessions` only if it asserts nothing else); change the default and the three documents.
- [ ] **Step 4: Run the full suites** `pnpm verify` and `pnpm e2e`; for each failure caused by a second login ending the first session, fix the test (one login per test, or re-login in the test that needs the later session) and note which in the commit body — Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): a login ends every other session; sessions last 14 days`.

### Task 6: Logout everywhere

**Files:**

- Modify: `server/src/routes/auth.ts`, `server/src/services/authService.ts`, `client/src/features/Auth/services/authApi.ts`, `client/src/features/Auth/hooks/useSession.ts`, `client/src/features/Auth/components/AuthHeaderButton.tsx`, `e2e/auth.spec.ts`; Test: `server/tests/auth.test.ts`, `client/tests/authUi.test.tsx`

**Interfaces:**

- Consumes: `sessionStore.removeAll` (Task 5), `requireAdmin`.
- Produces: `authService.logoutAll(): void`; `POST /api/auth/logout-all` → 204, clears the cookie exactly as `/logout`; `authApi.logoutAll(): Promise<void>`; `useLogoutAll()` with the same cache update as `useLogout`.

- [ ] **Step 1: Write the failing tests.** Server: with a session, `logout-all` is 204, the `Set-Cookie` clears the cookie, and `me` with the old token is unauthenticated; without a cookie it is 401; with a revoked session's cookie it is 401; called twice, the second call is 401; with a wrong `Origin` it is 403 and the session survives; `sessionStore` holds zero rows afterwards. Client: the admin sees a "Log out everywhere" button next to "Log out"; clicking it calls `authApi.logoutAll` once and shows "Log in" again. e2e: log in, click "Log out everywhere", reload `/cocktails`, the "Log in" link is visible.
- [ ] **Step 2: Run** the new tests — Expected: FAIL.
- [ ] **Step 3: Implement** the route after `/logout` with `requireAdmin`, the service method, the client function, hook and button.
- [ ] **Step 4: Run** `pnpm verify`, `pnpm build`, `pnpm e2e` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: log out everywhere`.

### Branch 2 close

- [ ] `branch-reviewer` on the whole branch; tell the owner before pushing; PR into `develop`; `ci-watcher`.

---

## Branch 3 — `feat/graceful-shutdown` (from `develop` after Branch 2 is merged)

### Task 7: Shutdown helper and wiring

**Files:**

- Create: `server/src/lib/shutdown.ts`, `server/tests/shutdown.test.ts`
- Modify: `server/src/index.ts`, `server/src/config/limits.ts` (`SHUTDOWN_FORCE_MS = 8000`)

**Interfaces:**

- Produces: `installShutdown(server: Server, options: { closeDb: () => void; forceAfterMs?: number; exit?: (code: number) => void; signals?: NodeJS.Signals[] }): () => void` — registers `SIGTERM` and `SIGINT` handlers and returns the shutdown function (so tests call it directly).

- [ ] **Step 1: Write the failing tests** (a real `http.Server` on port 0, fake `exit`, fake timers where needed): shutdown stops accepting new connections, calls `closeDb` only after the close callback, then `exit(0)`; an idle keep-alive connection does not delay it; an in-flight slow request finishes with its response before `closeDb`; with a request that never finishes, `exit(1)` fires after `forceAfterMs` and an error line is logged; a second signal calls `exit(1)` at once; `closeDb` throwing logs an error and exits 1; no timer exists before the first signal and the force timer is `unref`'d (`vi.getTimerCount()` is 0 before; the timer object's `hasRef()` is false).
- [ ] **Step 2: Run** `pnpm --filter cocktail-server exec vitest run tests/shutdown.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `installShutdown` per spec section "Shutdown"; in `index.ts` call it with `closeDb: () => db.close()` (import `db` from `./data/connection.js`). `index.ts` stays excluded from coverage.
- [ ] **Step 4: Run** `pnpm verify` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): shut down gracefully on SIGTERM and SIGINT`.

### Task 8: Container check and the status update

**Files:**

- Modify: `CLAUDE.md` ("Current status & next steps"), `docs/superpowers/specs/2026-11-05-login-session-hardening-design.md` (Status: implemented, plus a "Measured" note)

- [ ] **Step 1: Build the image and run it on a throwaway stack** (project name `cocktail-wp4-check`, a free host port, a temporary volume; never the owner's stacks). With a login done and a slow request in flight if practical, `docker stop` it and record: exit code 0, time under 1 s idle, and that the log shows the shutdown line. Also check, against the running container, 4 wrong logins then the 429 with `Retry-After` and one correct login after 30 s. Remove the stack and volume afterwards and confirm with `docker ps -a` and `docker volume ls` filtered on `wp4-check`.
- [ ] **Step 2: Update** `CLAUDE.md` status (WP4 done, what remains: WP5 Branch 3 and WP6 to WP9) and the spec status and measurements.
- [ ] **Step 3: Run** `pnpm verify` — Expected: PASS.
- [ ] **Step 4: Commit** `docs: login and session hardening is done`.

### Branch 3 close

- [ ] `branch-reviewer` on the branch; tell the owner before pushing; PR into `develop` (it carries the measurements and the status update); `ci-watcher`; the owner merges. Then the "Ending a subject" steps in agent-kit's `CLAUDE.md`.

---

## Execution notes

- One agent per branch's tasks, context checked at each branch boundary. Tiers: `task-implementer` for Tasks 2 to 7 (several files, behaviour described in prose), `task-transcriber` is not used (the plan holds signatures and tests, not complete code). `task-reviewer` after each task, `branch-reviewer` per branch (security-sensitive), `ci-watcher` per PR. A task that fails review twice is redone one tier up.
- Worktree per branch cut from `origin/develop`, never the main folder; the owner is told before each push and merges.
- Efficiency rows and their checks: network and idle (Tasks 4 and 6 tests), CPU per login (Task 2 spy test), memory (Task 1 review), database (Task 5), timers (Tasks 4 and 7), bundle (Task 4 Step 4), startup/shutdown (Task 8 Step 1).
