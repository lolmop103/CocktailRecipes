# Production fail-safes — design

Date: 2026-11-03 · Status: draft, awaiting review

## Purpose

A production server must not start with proxy settings that lock the admin out or
quietly break writes. Two settings decide this, and both currently have defaults that
are wrong behind a real proxy:

- `TRUST_PROXY_HOPS` defaults to `0` (`server/src/config/env.ts`), and
  `.env.example` ships `TRUST_PROXY_HOPS=0`. Compose reads `${TRUST_PROXY_HOPS:-1}` from
  the project `.env`, so a server `.env` copied from `.env.example` runs production with
  0 hops. Every visitor then looks like Caddy's address: the login failure limit
  (5 per 15 minutes per IP) can be used by anyone to keep the admin locked out, and the
  120 reads per minute are shared by all visitors.
- `CLIENT_ORIGIN` defaults to `http://localhost:5173` and accepts `http://` in
  production. A missing value fails closed (every admin write answers 403) but gives no
  hint why.

This is work package 1 of the go-public hardening audit of 2026-11-02 (handoff:
`tasks/handoff/CocktailRecipes.md` in agent-kit). It needs no containers or server.

**Success means**

- `NODE_ENV=production` without an explicit `TRUST_PROXY_HOPS` or `CLIENT_ORIGIN` stops
  at startup with a message naming the variable.
- A production `CLIENT_ORIGIN` must be `https://`, except for a loopback host.
- The local production-image stack, the e2e run, the load probe and the CI smoke test
  keep working, each with the values written down.
- Development and test behave as before (defaults stay).

## Decisions (locked)

| Decision                                                                 | Rationale                                                                                                                                                  |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRUST_PROXY_HOPS` is required in production; `0` is valid when explicit | The right count depends on the topology (0 local, 1 behind Caddy, 2 behind Cloudflare and Caddy) and cannot be guessed. The local `docker-compose.yml` has no proxy. |
| `CLIENT_ORIGIN` is required in production, no localhost default           | A wrong default only shows up as unexplained 403s on every admin write.                                                                                   |
| Production `CLIENT_ORIGIN` must be `https://`, unless the host is `localhost`, `127.0.0.1` or `[::1]` | The session cookie is `Secure` and `__Host-` in production, so a public `http://` origin cannot work. Loopback `http://` keeps the local stack, e2e and probe usable without local TLS. |
| Presence is checked on the raw `process.env`, not on the defaulted value  | The schema applies defaults before `superRefine` runs, so the parsed value cannot tell "unset" from "default".                                              |
| `compose.prod.yaml` loses the `:-1` fallback                              | `${TRUST_PROXY_HOPS:?…}` makes `compose config` fail on a server `.env` that lacks it, before the container starts.                                       |
| Defaults stay in development and test                                     | Local work and the test suite must not need proxy settings.                                                                                                |

## Starting point

- `server/src/config/env.ts`: `CLIENT_ORIGIN` is parsed with `.url()`, refined to a bare
  origin, normalised, defaulted. `TRUST_PROXY_HOPS` is `z.coerce.number().int().min(0).max(5).default(0)`.
  A `superRefine` already requires `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` in production.
- Places that run production mode today: `compose.prod.yaml` (sets hops with a `:-1`
  fallback), `docker-compose-test.yml` (sets both, https origin), `docker-compose.yml`
  (sets the origin, no hops), `playwright.config.ts` (sets the origin, no hops),
  `scripts/load-probe.mjs` (sets the origin, no hops), the CI smoke test in
  `.github/workflows/ci.yml` (sets neither), `server/tests/production.test.ts` (sets
  the origin, no hops).

## Behaviour

In production (`NODE_ENV=production`):

| Input                                         | Result                                                       |
| --------------------------------------------- | ------------------------------------------------------------ |
| `TRUST_PROXY_HOPS` unset                      | Startup error: `TRUST_PROXY_HOPS: is required in production (0 = no proxy, 1 = Caddy, 2 = Cloudflare and Caddy)` |
| `TRUST_PROXY_HOPS=0`                          | Accepted                                                     |
| `CLIENT_ORIGIN` unset                         | Startup error: `CLIENT_ORIGIN: is required in production`    |
| `CLIENT_ORIGIN=http://cocktails.example.com`  | Startup error: `CLIENT_ORIGIN: must be https:// in production (http:// is allowed only for localhost)` |
| `CLIENT_ORIGIN=http://localhost:3009`         | Accepted (also `127.0.0.1`, `[::1]`)                         |
| `CLIENT_ORIGIN=https://cocktails.example.com` | Accepted                                                     |

Errors are collected with the existing ones, so one start attempt lists every problem.

## Files

- `server/src/config/env.ts`: the production checks above.
- `compose.prod.yaml`: `TRUST_PROXY_HOPS: ${TRUST_PROXY_HOPS:?set TRUST_PROXY_HOPS in .env (1 behind Caddy, 2 behind Cloudflare and Caddy)}`.
- `docker-compose.yml`: `TRUST_PROXY_HOPS: '0'`.
- `playwright.config.ts`, `scripts/load-probe.mjs`: add `TRUST_PROXY_HOPS: '0'`.
- `.github/workflows/ci.yml` smoke test: `-e TRUST_PROXY_HOPS=0 -e CLIENT_ORIGIN=http://localhost:3000`.
- `.env.example`, `README.md` (variable table), `docs/deploy.md` (the `.env` block and the
  `TRUST_PROXY_HOPS=1 itself` sentence): state that production requires both. The full
  rewrite of `deploy.md` is out of scope.

## Error cases

Startup errors only; no request-time behaviour changes. A server that previously
started with a missing hop count now refuses, which is the point.

## Efficiency budget

No new request, timer, payload or client code. The check runs once at startup. Budget
rows: none touched.

## Testing

- `server/tests/env.test.ts`, written first, one case per row of the behaviour table,
  plus a development case showing the defaults still apply. The existing
  `env_productionWithAdmin_ok` gains the two variables.
- `server/tests/production.test.ts` gets the hop count it now needs.
- `pnpm verify` and `pnpm e2e` green (e2e proves the playwright change); `docker compose
  -f compose.prod.yaml config` with a `.env` lacking the variable fails with the message,
  and with it set succeeds (checked by running the command, no container started).
- The CI `configs` job copies `.env.example` to `.env` before `compose config`, so
  `.env.example` must keep `TRUST_PROXY_HOPS` set (it does: `0`) for that job to pass.

## Out of scope

The private network between Caddy and the app, the failed-login delay, `deploy.md`
rewrite, container limits, and anything on the VPS or Cloudflare (work packages 3, 4, 6
and 7 of the handoff).
