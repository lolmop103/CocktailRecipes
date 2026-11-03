# Production fail-safes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A production server refuses to start without an explicit `TRUST_PROXY_HOPS` and `CLIENT_ORIGIN`, and refuses a public `http://` origin.

**Architecture:** The checks live in the existing `superRefine` in `server/src/config/env.ts`, reading the raw `process.env` for presence because zod has already applied defaults to the parsed value. Every place that runs production mode today is given the values explicitly, and `compose.prod.yaml` stops falling back to 1.

**Tech Stack:** TypeScript, zod 4, Vitest, Docker Compose, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-03-production-failsafes-design.md`

## Global Constraints

- Applies only when `NODE_ENV=production`; development and test keep their defaults (`TRUST_PROXY_HOPS` 0, `CLIENT_ORIGIN` `http://localhost:5173`).
- Messages, verbatim:
  - `is required in production (0 = no proxy, 1 = Caddy, 2 = Cloudflare and Caddy)` on `TRUST_PROXY_HOPS`
  - `is required in production` on `CLIENT_ORIGIN`
  - `must be https:// in production (http:// is allowed only for localhost)` on `CLIENT_ORIGIN`
- `http://` is allowed only when the origin's host is exactly `localhost`, `127.0.0.1` or `[::1]`.
- All issues are reported together by the existing `Invalid environment configuration:` error.
- Test names follow the file's style (`env_<situation>_<result>`). Conventional Commits. `pnpm verify` green before every PR; no `Co-Authored-By` lines.
- One branch from `develop`: `feat/production-failsafes`; PR into `develop`.

## Review Focus

- Empty values (`TRUST_PROXY_HOPS=`, `CLIENT_ORIGIN=`), which compose passes through from `${VAR}` when unset: must count as unset, not as `0` or a parse error with no hint. Pinned in Task 1.
- Look-alike hosts (`http://localhost.evil.com`, `http://127.0.0.1.example.com`, `http://localhost@evil.com`): must not get the loopback exception. Pinned in Task 1.
- IPv6 loopback `http://[::1]:3009` and upper-case `http://LOCALHOST:3009`: must be accepted. Pinned in Task 1.
- Development and test with both variables unset: must still start with the defaults. Pinned in Task 1.
- A server `.env` copied from `.env.example`: must no longer carry a hop count into compose. Pinned in Task 2 by the `compose config` check.

---

### Task 1: Production checks in env.ts

**Files:**

- Modify: `server/src/config/env.ts` (the `superRefine`, lines 47-63)
- Test: `server/tests/env.test.ts`, `server/tests/production.test.ts`

**Interfaces:**

- Consumes: the existing `envSchema`, `loadEnv()` test helper, `process.env`.
- Produces: no new exports. `env.TRUST_PROXY_HOPS` and `env.CLIENT_ORIGIN` keep their types; in production they are now always explicit.

- [ ] **Step 1: Write the failing tests** in a new `describe('env — production proxy settings')` in `server/tests/env.test.ts`. Each stubs `NODE_ENV=production` and `ALLOW_WEAK_ADMIN_HASH=true` (the vitest config supplies the admin variables), then sets `TRUST_PROXY_HOPS` and `CLIENT_ORIGIN` as stated:
  - `env_productionWithoutTrustProxyHops_failsNamingTheVariable`: hops unset, origin `https://cocktails.example.com` → rejects with `/TRUST_PROXY_HOPS: is required in production \(0 = no proxy, 1 = Caddy, 2 = Cloudflare and Caddy\)/`.
  - `env_productionWithEmptyTrustProxyHops_failsAsUnset`: hops `''` → same rejection.
  - `env_productionWithoutClientOrigin_failsNamingTheVariable`: origin unset, hops `'1'` → `/CLIENT_ORIGIN: is required in production/`.
  - `env_productionWithEmptyClientOrigin_failsAsUnset`: origin `''` → same rejection.
  - `env_productionWithNeither_listsBothInOneError`: both unset → one rejection matching `/TRUST_PROXY_HOPS[\s\S]*CLIENT_ORIGIN/`.
  - `env_productionWithPublicHttpOrigin_fails`: `http://cocktails.example.com` → `/CLIENT_ORIGIN: must be https:\/\/ in production \(http:\/\/ is allowed only for localhost\)/`.
  - `env_productionWithLookAlikeLocalhost_fails`: a `it.each` over `http://localhost.evil.com`, `http://127.0.0.1.example.com`, `http://localhost@evil.com`; each rejects with the https message.
  - `env_productionWithLoopbackHttpOrigin_ok`: `it.each` over `http://localhost:3009`, `http://127.0.0.1:3100`, `http://[::1]:3009`, `http://LOCALHOST:3009`; each loads, hops `'0'`, and `env.CLIENT_ORIGIN` equals the lower-cased origin.
  - `env_productionWithHttpsOriginAndExplicitZeroHops_ok`: origin `https://cocktails.example.com`, hops `'0'` → loads, `env.TRUST_PROXY_HOPS` is `0`.
  - `env_developmentWithoutProxySettings_keepsDefaults`: `NODE_ENV=development`, both unset → `TRUST_PROXY_HOPS` 0, `CLIENT_ORIGIN` `http://localhost:5173`.
  - In the same file, update `env_productionWithAdmin_ok` and `env_productionWithTestHashAndAllowWeak_ok` to also stub `TRUST_PROXY_HOPS='1'` and `CLIENT_ORIGIN='https://cocktails.example.com'`, so they keep proving what they prove.
  - In `server/tests/production.test.ts` add `vi.stubEnv('TRUST_PROXY_HOPS', '0')` next to the existing `CLIENT_ORIGIN` stub (line 33).

- [ ] **Step 2: Run the new tests and see them fail**

Run: `pnpm --filter cocktail-server exec vitest run tests/env.test.ts tests/production.test.ts`
Expected: the "fails" cases FAIL because production loads without the variables; the "ok" cases may pass already.

- [ ] **Step 3: Implement the checks in the `superRefine` of `server/src/config/env.ts`**, after the `if (value.NODE_ENV !== 'production') return;` line. Presence is read from `process.env` (the value counts as unset when `undefined` or `''`); the https rule is read from the parsed `value.CLIENT_ORIGIN`, which is already a normalised origin, and applies only when the variable was set. Loopback is decided by an exact match of `new URL(value.CLIENT_ORIGIN).hostname` against `localhost`, `127.0.0.1`, `[::1]`. Keep the three messages from Global Constraints verbatim, as `ctx.addIssue({ code: 'custom', path: [name], message })`. A short comment states why the raw environment is read (defaults hide absence).

- [ ] **Step 4: Run the tests and see them pass**

Run: `pnpm --filter cocktail-server exec vitest run tests/env.test.ts tests/production.test.ts`
Expected: all PASS.

- [ ] **Step 5: Run the server suite with the coverage gate**

Run: `pnpm --filter cocktail-server test`
Expected: PASS, coverage at or above 80%.

- [ ] **Step 6: Commit**

```bash
git add server/src/config/env.ts server/tests/env.test.ts server/tests/production.test.ts
git commit -m "feat(server): require proxy hops and an https origin in production"
```

---

### Task 2: Give every production-mode caller its values

**Files:**

- Modify: `compose.prod.yaml:24`, `docker-compose.yml` (environment block), `playwright.config.ts:33-35`, `scripts/load-probe.mjs:80-84`, `.github/workflows/ci.yml` (`configs` job and the smoke-test `docker run`), `.env.example:25-26`, `README.md:119,126`, `docs/deploy.md:18-20,63,69-70`

**Interfaces:**

- Consumes: Task 1's rule that production needs both variables.
- Produces: nothing code-level; later packages (WP6, WP7) rely on `compose.prod.yaml` failing without `TRUST_PROXY_HOPS`.

- [ ] **Step 1: Show the failure first.** With a `.env` containing the admin variables but no `TRUST_PROXY_HOPS`, run `docker compose -f compose.prod.yaml config -q` and note that it still succeeds (it falls back to 1). Do not start any container.

- [ ] **Step 2: Edit the files**
  - `compose.prod.yaml`: `TRUST_PROXY_HOPS: ${TRUST_PROXY_HOPS:?set TRUST_PROXY_HOPS in .env (1 behind Caddy, 2 behind Cloudflare and Caddy)}`; update the comment above it to say there is no default.
  - `docker-compose.yml`: add `TRUST_PROXY_HOPS: '0'` with a one-line comment (no proxy; this stack is reached directly).
  - `playwright.config.ts` and `scripts/load-probe.mjs`: add `TRUST_PROXY_HOPS: '0'` next to `CLIENT_ORIGIN`.
  - `.github/workflows/ci.yml`: in the `configs` job add `TRUST_PROXY_HOPS=1` to the `export` line; in the smoke test add `-e TRUST_PROXY_HOPS=0 -e CLIENT_ORIGIN=http://localhost:3000` to the `docker run`.
  - `.env.example`: comment out `TRUST_PROXY_HOPS=0` (keep it as `# TRUST_PROXY_HOPS=1`) and rewrite its comment: required in production, development defaults to 0, and a value copied from here must be chosen deliberately.
  - `README.md`: the `TRUST_PROXY_HOPS` row becomes "— (required in production)", with `0` locally; the `CLIENT_ORIGIN` row becomes "— (required in production)" and says `https://` outside localhost.
  - `docs/deploy.md`: add `TRUST_PROXY_HOPS=1` (or 2 behind Cloudflare) to the `.env` block, change the sentence at 69-70 to say `compose.prod.yaml` no longer sets it, and say `CLIENT_ORIGIN` must be `https://`. Do not rewrite anything else (WP7).

- [ ] **Step 3: Verify the compose files**

Run, from the repo root with no container started:

```bash
cp .env.example ../env-check.tmp   # scratch copy outside the repo, not the real .env
docker compose --env-file ../env-check.tmp -f compose.prod.yaml config -q   # delete the copy afterwards
```

Expected: fails with `set TRUST_PROXY_HOPS in .env`.
Then `TRUST_PROXY_HOPS=1 ADMIN_USERNAME=ci ADMIN_PASSWORD_HASH=ci` in front of the same command, and of `docker-compose.yml` and `docker-compose-test.yml` `config -q`: all succeed. This is the Review Focus case for a copied `.env.example`.

- [ ] **Step 4: Full verification**

Run: `pnpm verify`, then `pnpm e2e`
Expected: both green (e2e proves the Playwright change; the production boot there needs the two variables).

- [ ] **Step 5: Check the probe starts**

Run: `pnpm probe` (starts the server in production mode itself; no Docker)
Expected: the server starts and the probe prints its report. If it exceeds the budget rows because the machine is slow, say so in the PR rather than changing code.

- [ ] **Step 6: Commit**

```bash
git add compose.prod.yaml docker-compose.yml playwright.config.ts scripts/load-probe.mjs .github/workflows/ci.yml .env.example README.md docs/deploy.md
git commit -m "chore: pass proxy hops and origin explicitly wherever production mode runs"
```

---

## After both tasks

Whole-branch review (`branch-reviewer`: this is a security-sensitive change), push `feat/production-failsafes`, open a PR into `develop`, watch CI through one `ci-watcher`. Update the "Current status & next steps" in `CLAUDE.md` in this PR: the `Not yet set up` text is unchanged, add one line that production now needs both variables. A human merges. Then update `tasks/handoff/CocktailRecipes.md` in agent-kit (WP1 done, next WP2).
