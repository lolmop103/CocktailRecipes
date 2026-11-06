# Login and session hardening — design

Date: 2026-11-05 · Status: implemented

Go-public audit of 2026-11-02, work package 4. Work packages 1 to 3 (production
fail-safes, CSP and fonts, compose hardening) are merged.

## Purpose

Make guessing the single admin password slow, make a stolen session cookie short-lived
and revocable on demand, and let the server stop cleanly. Nothing changes for the
owner's normal use: one username, one password, one login every two weeks.

Not changed on purpose (`AGENTS.md` "Not set up on purpose"): no sign-up, no 2FA, no
password reset, no lockout, nothing keyed on the client IP.

## Findings from the current code

- `POST /api/auth/login` (`server/src/routes/auth.ts`) calls `authService.login`, which
  always runs scrypt (N=2^15, about 32 MiB) and answers a wrong username or password
  with the same 401 "Wrong username or password".
- The only brake on guessing is `loginFailures` (`middleware/rateLimits.ts`,
  `config/limits.ts`): 5 failures per 15 minutes **per IP**, in memory. Behind
  Cloudflare an attacker rotates addresses and is never slowed.
- Sessions (`data/sessionStore.ts`, table `sessions`: `token_hash`, `credential_tag`,
  `created_at`, `expires_at`): a login adds a row and revokes nothing; logout removes
  only the presented token; changing the admin username or password hash invalidates
  every session through `credential_tag`. `SESSION_TTL_DAYS` defaults to 30, fixed from
  login (not sliding).
- `server/src/index.ts` has no signal handler. The container runs with `init: true`, so
  SIGTERM reaches node, which dies at once: in-flight requests are cut and the SQLite
  connection is never closed.
- A failed login logs one warn line from `errorHandler.ts` (method, path, 401, message).
  It does not distinguish one typo from a flood. `logger.ts`: "Never log PII".

## Decisions (locked)

| #   | Topic                | Decision                                                                                                                                                                                                                                                                                                                                                                                                                      | Rationale / cost if wrong                                                                                                                                                                                                                                                                                 |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Failed-login delay   | One global throttle (one account, so not keyed on IP). The first 3 attempts after a reset are answered normally; once 3 have been admitted without a success, the next attempt is admitted only after a flat 30 s. An attempt inside the window gets 429 with `retryAfterSeconds` and a `Retry-After` header, without running scrypt. A correct login resets the counter, and so does 15 minutes without an admitted attempt. | A guesser is held to one attempt per 30 s (about 120 an hour). Refusing without scrypt costs the server nothing and holds no connection. Cost if wrong: an attacker who times a request to the end of each window keeps the owner out as well (see Risks). The values are constants in `config/limits.ts` |
| 2   | Attempt accounting   | An attempt is charged when it is admitted, before the password is checked, and refunded by the reset when it succeeds.                                                                                                                                                                                                                                                                                                        | Parallel requests cannot all slip through before the first failure is recorded: of any burst, at most 3 reach scrypt                                                                                                                                                                                      |
| 3   | What counts          | Only a request that passed validation and was admitted counts. A malformed body (400), a cross-site request (403) and a request refused by the cooldown (429) neither count nor extend the window.                                                                                                                                                                                                                            | A page the admin visits cannot lock the admin out with junk requests (the reason the old limiter counted only 401s), and the owner never waits longer than 30 s                                                                                                                                           |
| 4   | State                | In memory, one module with an injectable clock.                                                                                                                                                                                                                                                                                                                                                                               | Single process. A restart resets it and an attacker cannot cause a restart. Cost if wrong: after a crash an attacker gets 3 free guesses again                                                                                                                                                            |
| 5   | Per-IP login limiter | `loginFailures`, `LOGIN_FAILURE_LIMIT` and its wiring in `app.ts` are removed. The read and write limiters stay.                                                                                                                                                                                                                                                                                                              | The global throttle is stricter and does not depend on an address a proxy chain can obscure. Cost if wrong: one noisy IP is no longer capped separately                                                                                                                                                   |
| 6   | Revoke on login      | A successful login deletes every other session and creates the new one in one transaction.                                                                                                                                                                                                                                                                                                                                    | Effectively one session at a time: a stolen cookie dies the next time the owner logs in. Cost: logging in on a second device logs the first one out (it sees the existing "session expired" banner)                                                                                                       |
| 7   | Logout everywhere    | `POST /api/auth/logout-all`, admin only, behind the existing `sameOrigin` check. It deletes every session row, including the caller's, clears the cookie, answers 204. One menu entry beside "Log out" in `AuthHeaderButton`.                                                                                                                                                                                                 | Gives the owner a way to end a suspected theft without changing the password. Without a valid session the call answers 401 like any admin route                                                                                                                                                           |
| 8   | Session lifetime     | `SESSION_TTL_DAYS` default 30 becomes 14, fixed from login, not sliding. No access/refresh token pair.                                                                                                                                                                                                                                                                                                                        | Sessions are server-side rows checked on every request, so revocation is already immediate; refresh tokens would add rotation and reuse detection for no gain. Cost: a re-login every two weeks. The variable still overrides the default                                                                 |
| 9   | Graceful shutdown    | On SIGTERM or SIGINT: stop accepting connections, close idle keep-alive connections, let in-flight requests finish, close the SQLite connection, exit 0. Forced exit 8 s after the signal (below the 10 s stop timeout that `compose.prod.yaml` sets with `stop_grace_period: 10s`, because the daemon default can be as low as 1 s). A second signal exits at once.                                                          | No cut requests on a deploy and the database file is closed cleanly. Cost if wrong: a request that needs more than 8 s is cut, which is what happened before                                                                                                                                              |
| 10  | Failed-login log     | A dedicated warn line per admitted failed attempt with `consecutiveFailures` and `cooldownSeconds`; refusals are not logged per request, only the first refusal of each window logs one warn line. No line contains the IP, the typed username, the password or which of the two was wrong. The generic `errorHandler` line for the 401 stays as is.                                                                          | The owner can see an attack in the logs without storing personal data, and a flood of refused requests cannot flood the logs. Cost: no forensic source address; the edge or Cloudflare logs hold it                                                                                                       |
| 11  | No account oracle    | A wrong username, a wrong password and both wrong all give the same 401 text and run the same scrypt. The 429 does not say which field was wrong because it is sent before either is looked at.                                                                                                                                                                                                                               | Unchanged behaviour, now covered by a test that compares the three responses                                                                                                                                                                                                                              |

## Behaviour

### Throttle (`server/src/lib/loginThrottle.ts`)

State: `failures` (admitted attempts since the last reset), `lastAttemptAt`,
`blockedUntil`.

`admit(now)`:

1. If `lastAttemptAt` is set and `now - lastAttemptAt >= IDLE_RESET_MS` (15 min),
   reset.
2. If `now < blockedUntil`: return `{ ok: false, retryAfterSeconds: ceil((blockedUntil - now) / 1000) }`.
3. Otherwise `failures += 1`, `lastAttemptAt = now`; when `failures >= FREE_ATTEMPTS`
   (3) set `blockedUntil = now + COOLDOWN_MS` (30 s). Return `{ ok: true }`.

`succeed()` resets all three. `authService.login` calls `admit`, then verifies the
password, then calls `succeed` on success. The refusal is a 429 raised before scrypt.

Consequences, stated so the tests can pin them: attempts 1 and 2 never wait; attempt 3
is answered normally and starts the first window; an attempt 30 s later is admitted and,
being a failure, starts the next window; a correct password on any admitted attempt
resets; a correct password inside a window is refused until the window ends.

### Login (`authService.login`)

Order: configured check (503) → `admit` (429) → scrypt → compare → on failure the log
line of decision 10 and the 401; on success `succeed`, one transaction that deletes all
sessions and inserts the new one, purge of expired rows, cookie with the 14 day maximum
age. `sessionStore` gets `replaceAll(tokenHash, credentialTag, createdAt, expiresAt)`
(delete all, insert one, in a transaction) and `removeAll()`.

### Logout everywhere

`authRouter.post('/logout-all', requireAdmin, …)`: `authService.logoutAll()` calls
`sessionStore.removeAll()`; the handler clears the cookie exactly as `/logout` does.

### Shutdown (`server/src/lib/shutdown.ts`)

`installShutdown(server, { closeDb, forceAfterMs = 8000, exit = process.exit })`
registers the SIGTERM and SIGINT handlers and returns the shutdown function. It calls
`server.close()` and `server.closeIdleConnections()`, waits for the close callback,
calls `closeDb()`, logs one info line, exits 0. A socket is ended when its response
finishes after shutdown has started, so keep-alive connections do not delay the exit;
pipelined requests on such a connection are dropped (accepted: browsers and Caddy do
not pipeline). A `setTimeout(...).unref()` forces exit
1 after `forceAfterMs` with an error line. A second signal exits 1 at once.
`index.ts` wires it with `db.close`.

### Client

- `ApiError` carries `retryAfterSeconds` (read from the body). `ApiErrorBody` in
  `packages/shared/src/errors.ts` gains the optional `retryAfterSeconds`.
- `LoginPage`: after a 429 the error line reads "Too many attempts — try again in N s",
  the submit button is disabled and N counts down once a second. The interval exists
  only while N > 0 and is cleared on unmount.
- `AuthHeaderButton`: a second button "Log out everywhere" for the admin, calling a new
  `authApi.logoutAll` and the same cache update as `useLogout`.

## API surface

| Method and path             | Change                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/auth/login`      | New 429 `{ status, message, retryAfterSeconds }` plus `Retry-After`; success now revokes all other sessions. Request and 204 response unchanged. |
| `POST /api/auth/logout-all` | New. 204; 401 without a session; 403 cross-site.                                                                                                 |
| Schema                      | `ApiErrorBody.retryAfterSeconds?: number` in `packages/shared`. No database migration: the `sessions` table is unchanged.                        |

## Error cases

- Not configured: 503 as before, no throttle charge.
- Malformed body or cross-site request: 400/403, no charge.
- Inside a window: 429 with the remaining seconds, rounded up, minimum 1.
- Wrong credentials: 401, same text for every wrong combination.
- `logout-all` without a session: 401. With a cookie for an expired or revoked session: 401.
- Shutdown with a request that outlives the grace period: forced exit 1 after 8 s.

## Efficiency budget

| Resource                     | Budget (number)                                                                                                                         | How the design meets it                                                                                                 | How it is verified                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Network per action           | Login: unchanged request, 1 request. Logout everywhere: 1 request, 204, no body. A 429 body ≤ 200 bytes. No new request on any page.    | One new endpoint with an empty response; the countdown is local, it makes no request.                                   | Server tests assert 204 and the 429 body size; a client test asserts no request is sent while the countdown runs |
| Network while idle           | 0 requests while the login page or the app is open and nothing changes.                                                                 | No polling: the cooldown countdown is a local timer, the session is checked as before (one `GET /api/auth/me` on load). | Client test with fake timers: advancing a minute sends nothing                                                   |
| Server CPU per login         | At most 3 scrypt runs per 30 s window and none for a refused attempt; a burst of 100 parallel attempts runs scrypt ≤ 3 times.           | Charge on admission (decision 2); refusal before the hash.                                                              | Unit test with a spy on `verifyPassword`: 100 parallel `login` calls → ≤ 3 calls                                 |
| Server memory                | Throttle state ≤ 3 numbers; no per-IP map. Removing the per-IP limiter drops its counter map.                                           | One module-level record.                                                                                                | Code review of the module; no collection grows with requests                                                     |
| Database                     | Login: 1 transaction with 1 `DELETE` + 1 `INSERT` (+ the existing purge). Logout everywhere: 1 `DELETE`. `sessions` holds ≤ 1 live row. | `replaceAll` and `removeAll` are prepared statements; the table stays tiny because login revokes the rest.              | Store test: after two logins one row remains                                                                     |
| Timers (client)              | One 1 s interval only while a countdown is visible; 0 timers otherwise; cleared at 0 and on unmount.                                    | A `useEffect` that starts only when `retryAfterSeconds > 0`.                                                            | Component test: no interval after unmount or at 0 (fake timers, `vi.getTimerCount()`)                            |
| Timers (server)              | 0 recurring timers. One 8 s forced-exit timer, created only after a signal and `unref`'d.                                               | No interval for the throttle: it compares timestamps on demand.                                                         | Shutdown test: no timer before the signal; the timer does not keep the process alive                             |
| Client bundle                | Gzipped main chunk grows ≤ 1 KB; the login chunk ≤ 1 KB. No dependency added.                                                           | A few lines in `AuthHeaderButton`, `LoginPage` and `authApi`.                                                           | `pnpm build` size compared with develop, recorded in the PR                                                      |
| Rendering                    | No new re-render of the recipe list. The countdown re-renders only `LoginPage` once per second while visible.                           | State lives in a small hook on the login page, nowhere else.                                                            | Review; component test                                                                                           |
| Startup / shutdown           | Startup unchanged. Shutdown completes in ≤ 8 s, normally under 1 s with no requests in flight.                                          | Idle connections closed at once; forced-exit timer.                                                                     | Shutdown test with fake timers; one measured `docker stop` on a throwaway stack, time recorded in the PR         |
| Location / sensors / battery | n/a — a web app that uses neither.                                                                                                      | n/a                                                                                                                     | n/a                                                                                                              |

## Testing bar

Test first, as always, and `pnpm verify`, `pnpm build` and `pnpm e2e` green.

- `loginThrottle`: the table of consequences above with a fake clock; idle reset;
  success reset; refused attempts do not extend the window; parallel burst admits ≤ 3.
- `authService`: wrong username, wrong password and both wrong give an identical error
  and each calls `verifyPassword` once; a refused attempt calls it zero times; success
  deletes every other session; an old token no longer validates after a new login.
- Auth routes (supertest): 429 shape and `Retry-After`; 400 and 403 do not charge;
  `logout-all` 204 / 401 / 403 and the cookie is cleared; two sessions, one
  `logout-all`, both dead.
- Rate limits: the old login-failure tests are removed; a test asserts that read and
  write limits still apply and that login is not blocked by the write limiter.
- Shutdown: server closes, `closeDb` runs after the close callback, exit code 0; the
  forced exit fires at 8 s when a connection hangs; a second signal exits at once.
- Logs: the failed-login line holds the count and the cooldown and none of the typed
  username, the password or an address (assert on the serialized line); one line per
  window for refusals.
- Client: `ApiError.retryAfterSeconds`; the countdown disables and re-enables the
  button and leaves no timer behind; "Log out everywhere" sends one request and updates
  the session cache.
- e2e: log in, call logout-all, the next page load shows the logged-out state.

## Documentation

`CLAUDE.md` "Current status & next steps" in the last PR; `docs/deploy.md` and
`.env.example` where they name the 30-day default or the per-IP login limit;
`AGENT.md` if it lists the login limiter.

## Out of scope

2FA, password reset, sign-up, sliding sessions, access/refresh tokens, IP-based rules,
persisting the throttle across restarts, a login audit table, per-device session lists,
a notification on failed logins. WP5 Branch 3 (restore drill) and WP6 to WP9.

## Risks and open points

- **The window can be held by an attacker.** Decision 1 has no lockout and is not keyed
  on a client, so it cannot tell the owner from a guesser. An attacker who sends one
  request exactly when each window ends is admitted every time and the owner's own
  attempt is refused. This is a denial of the login page, not of the data (reading
  recipes needs no login), and it never lets the attacker in faster than one guess per
  30 s. Remedies if it happens: block the source at the edge or Cloudflare, or restart the
  container to reset the state. Accepted by the owner's choice of "no lockout, not IP-keyed".
- A password of 12+ random characters makes about 120 guesses an hour irrelevant; a
  short or reused one does not. `checkNewPassword` already requires 12 characters.
- The throttle is per process. A second replica would double the rate; the project
  runs one.
- `logout-all` ends the session that calls it; the owner logs in again.

## Measured

Throwaway stack (production image, own compose project, temporary volume, removed
afterwards), 2026-11-06, Docker 29.6.1 on the owner's machine:

- Idle `docker stop`: exit code 0, 0.54 s wall time, log lines "Shutting down" and
  "Shutdown complete" 7 ms apart.
- Login throttle against the running container: wrong logins 1 to 3 answered 401, the
  4th answered 429 with `Retry-After: 30`; one correct login 31 s later answered 204.
- A request in flight (body still being sent) when `docker stop -t 10` was issued
  finished with its normal response and the container exited 0. The connection it used
  stayed open as keep-alive, so shutdown completed about 6.5 s after the signal (the
  Node keep-alive timeout), inside the 8 s bound. Fixed afterwards: the socket is now
  ended when a response finishes during shutdown (covered by a unit test, not re-measured
  in a container).
- On this machine Docker's default stop timeout is 1 s (`StopTimeout=1`): a plain
  `docker stop` with a request in flight ended in SIGKILL (exit 137) after 1 s. The
  8 s grace period needs `stop_grace_period: 10s`, now set on the `cocktail` service in
  `compose.prod.yaml`.
