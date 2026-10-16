# Production hardening — design

Date: 2026-10-16 · Status: draft, awaiting review

## Purpose

Run Cocktail Recipes on the owner's VPS behind the owner's existing Caddy, so that
anyone can browse and filter the recipes while only the owner can change them, and
no visitor can make the site slow or unavailable through the read API.

**Success means**

- Every request that changes data is refused (401) without a valid admin session.
- No single read request can cost more than the measured budget below, however it
  is crafted.
- A single IP cannot exhaust the server; one visitor's traffic does not stall others.
- The admin password cannot be brute-forced through the login endpoint.

## Measured starting point (2026-10-15, production build, 1,008 recipes)

| Probe                                                          | Result                                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Typical filter, 20 concurrent                                  | 245 req/s, p50 76 ms, 0.6 KB                                                                    |
| Full list, 20 concurrent                                       | 62 req/s, p50 320 ms, **421 KB** per response                                                   |
| One request with 100 / 200 / 400 `excludeIngredients` terms    | 374 ms / 1.8 s / **10.2 s**, blocking every other request meanwhile (health check waited 1.8 s) |
| 10 clients repeating a 490-term include filter                 | normal users drop from 245 to **15 req/s**                                                      |
| ≥ 500 include terms with `onlySelectedIngredients`             | **500** — SQLite "Expression tree is too large", full stack logged                              |
| Recipes table grown past ~33,000 rows (unauthenticated `POST`) | unfiltered list **500** for everyone — "too many SQL variables" in `hydrateMany`                |
| Client bundle                                                  | JS 100.2 KB gzip, CSS 4.5 KB gzip                                                               |

Root causes: no authentication on writes; no limits on the number or length of
filter terms; no pagination; synchronous SQLite on the single event loop; no rate
limiting.

## Decisions (locked)

| #   | Decision                                                                                                                                                                                                  | Rationale                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | One admin account (the owner). No sign-up, no user table.                                                                                                                                                 | Only the owner edits; smallest attack surface.                                                                                                                                           |
| D2  | Server-side sessions in SQLite, opaque token in an `HttpOnly` cookie.                                                                                                                                     | Revocable (logout really ends the session), no secret to rotate, no new infrastructure. Signed stateless cookies and Caddy basic auth were rejected: no revocation / no proper login UI. |
| D3  | Credentials from env: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (scrypt). Required in production; the server refuses to start without them.                                                                 | Never deploy with open writes by accident; no plaintext password anywhere.                                                                                                               |
| D4  | Password hashing with Node's built-in `crypto.scrypt` (N=2^15, r=8, p=1, 64-byte key, 16-byte salt).                                                                                                      | No native dependency to compile; scrypt runs on the libuv thread pool, so login attempts do not block the event loop.                                                                    |
| D5  | All 9 write routes, including rating, collections and ingredient classification, require the admin session.                                                                                               | Every one of them changes shared data.                                                                                                                                                   |
| D6  | CSRF defence: `SameSite=Strict` cookie **and** an exact `Origin` check against `CLIENT_ORIGIN` on every non-GET/HEAD `/api` request.                                                                      | Two independent layers; no token plumbing in the client.                                                                                                                                 |
| D7  | Hard input limits in the shared zod schemas; anything over a limit is a 400, never a 500 or a slow query.                                                                                                 | Bounds the cost of every request by construction.                                                                                                                                        |
| D8  | Offset pagination: `limit` (default 24, max 48), `offset`; response `{ items, total, nextOffset }`.                                                                                                       | Bounds every response; keeps `hydrateMany` far below SQLite's variable limit. Keyset pagination is not worth it with three sort orders at this scale.                                    |
| D9  | Infinite scroll on the client, with a real "Show more" button as the same trigger.                                                                                                                        | Owner's choice; the button keeps it usable by keyboard and screen reader and is the fallback when auto-loading stops.                                                                    |
| D10 | Rate limiting **in the app** (`express-rate-limit`, in-memory store), keyed on the client IP as seen through exactly `TRUST_PROXY_HOPS` proxies.                                                          | The owner's Caddy is managed separately and standard Caddy has no rate limiter; the app must be safe on its own. One process → memory store is correct.                                  |
| D11 | The repository ships no Caddy service. It documents the site block to paste into the owner's Caddyfile and a `compose.prod.yaml` that joins the owner's external Docker network without publishing ports. | The owner runs and controls Caddy.                                                                                                                                                       |
| D12 | Compression is Caddy's job (`encode zstd gzip`); caching uses ETag + `Cache-Control`, no server-side response cache.                                                                                      | One place for compression; a response cache is bypassed by varied queries anyway, which the limits already bound.                                                                        |

## Threat model

| Threat                                          | Covered by                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Anonymous create / edit / delete / rate         | D2, D5 — 401                                                                                                  |
| Cross-site request from a page the admin visits | D6 — cookie not sent, and 403 on foreign `Origin`                                                             |
| Password guessing                               | 5 failed logins per IP per 15 min (429), slow scrypt, constant-time compare, dummy hash for unknown usernames |
| One expensive read request                      | D7 limits; worst legal query has a budget row                                                                 |
| Huge responses                                  | D8 pagination                                                                                                 |
| Request flood from one IP                       | D10 — 429                                                                                                     |
| Slow-loris style connections                    | Caddy first; `headersTimeout` 10 s and `requestTimeout` 30 s in the app as backstop                           |
| Log flooding with junk requests                 | 4xx logged as one warn line, no stack                                                                         |
| Flood from many IPs (botnet)                    | **Not covered by the app.** Mitigation is at the VPS provider or Caddy level; stated in `docs/deploy.md`.     |

## Design

### 1. Input limits (shared contract)

`recipeQuerySchema` gains:

| Field                                   | Limit                                                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `search`                                | 0–100 characters                                                                                                                          |
| `ingredients`, `excludeIngredients`     | after splitting on commas, trimming and removing empties and case-insensitive duplicates: at most 20 terms each, 1–60 characters per term |
| `collectionId`                          | digits only, at most 12 characters                                                                                                        |
| `limit`                                 | integer 1–48, default 24                                                                                                                  |
| `offset`                                | integer 0–100,000, default 0                                                                                                              |
| `sortBy`, `sortOrder`, `minRating`      | unchanged (already enums / bounded)                                                                                                       |
| `isMocktail`, `onlySelectedIngredients` | `"true"` or `"false"` only                                                                                                                |

Splitting and de-duplicating moves from `recipeService.toFilters` into the schema
(a zod `transform`), so the limit is checked on what the query actually runs.

Write schemas gain: recipe `name` 1–120, `instructions` ≤ 5,000, `glassType` ≤ 40,
`tags` ≤ 20 × 1–30 characters, `ingredients` 1–40 × (`name` 1–60, `amount` ≤ 30);
collection `name` 1–60; the ingredient name in `PATCH /api/ingredients/:name`
1–60. The JSON body limit drops from 1 MB to 64 KB and the unused `urlencoded`
parser is removed.

Express 5's default query parser turns a repeated key (`?search=a&search=b`) into
an array, which fails `z.string()` → 400. A test pins that.

The client's ingredient picker stops offering more terms once 20 are selected in
either list, with a visible hint ("Up to 20 ingredients").

### 2. Pagination

- `GET /api/recipes` → `RecipePage = { items: Recipe[]; total: number; nextOffset: number | null }`,
  defined in `packages/shared`.
- `recipeStore.query` runs the filtered `SELECT … LIMIT ? OFFSET ?` and a
  `SELECT COUNT(*)` with the same `WHERE`. `nextOffset` is `offset + items.length`
  when that is below `total`, else `null`.
- Every `ORDER BY` ends with `r.id` as the final tie-breaker so pages are stable.
- `hydrateMany` now receives at most 48 ids.
- An `offset` past the end returns `{ items: [], total, nextOffset: null }`, not an error.

### 3. Authentication

**Configuration** (`server/src/config/env.ts`): `ADMIN_USERNAME` (1–64 chars),
`ADMIN_PASSWORD_HASH` (format `scrypt$<N>$<r>$<p>$<salt b64>$<key b64>`),
`SESSION_TTL_DAYS` (default 30), `TRUST_PROXY_HOPS` (default 0). The two admin
variables are required when `NODE_ENV=production`; in development and test they are
optional, and without them login answers 503 "Admin login is not configured" and
writes stay 401.

`npm run hash-password` (server workspace) prompts for a password twice without
echo, rejects anything under 12 characters, and prints the hash line for `.env`.

**Data model** — migration `5_sessions`:

```sql
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,   -- hex SHA-256 of the cookie token
  created_at INTEGER NOT NULL,   -- unix ms
  expires_at INTEGER NOT NULL    -- unix ms
);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

**Endpoints**

| Method & path           | Body                                         | Success                                                                        | Errors                                                                                                              |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/login`  | `{ username, password }` (1–64, 1–256 chars) | 204 + `Set-Cookie`                                                             | 400 invalid body · 401 wrong credentials (one message for both fields) · 429 too many failures · 503 not configured |
| `POST /api/auth/logout` | —                                            | 204, session row deleted, cookie cleared (also when no session)                | —                                                                                                                   |
| `GET /api/auth/me`      | —                                            | 200 `{ authenticated: boolean, username?: string }`, `Cache-Control: no-store` | —                                                                                                                   |

Login always runs one scrypt verification, against a fixed dummy hash when the
username does not match, and compares with `crypto.timingSafeEqual`. On success it
deletes expired sessions, creates a 32-byte random token (`crypto.randomBytes`,
base64url), stores its SHA-256, and sets the cookie:

- production: `__Host-cocktail_session`, `Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=<TTL>`
- development / test: `cocktail_session`, same flags without `Secure` and without the `__Host-` prefix (plain HTTP)

The cookie is read with a small tested helper in `server/src/lib/cookies.ts`; no
`cookie-parser` dependency.

**Middleware** (`server/src/middleware/`):

- `session` — on every `/api` request, looks up the cookie's token hash; sets
  `req.admin = { username }` when a non-expired row exists.
- `requireAdmin` — 401 `{ status: 401, message: "Log in to make changes" }` when
  `req.admin` is absent. Applied per route to the 9 write routes: recipes
  `POST /`, `PATCH /:id`, `PATCH /:id/rating`, `DELETE /:id`; collections `POST /`,
  `POST /:id/recipes/:recipeId`, `DELETE /:id/recipes/:recipeId`, `DELETE /:id`;
  ingredients `PATCH /:name`.
- `sameOrigin` — for every non-GET/HEAD `/api` request, 403 unless the `Origin`
  header equals `CLIENT_ORIGIN` exactly (a missing `Origin` is a 403). Runs before
  `requireAdmin`, and also guards login and logout.

### 4. Rate limiting, caching, timeouts

- `app.set('trust proxy', env.TRUST_PROXY_HOPS)`; `compose.prod.yaml` sets 1.
- Limiters (per IP; IPv6 keyed per /56 subnet, the library default):

  | Limiter | Applies to                                            | Limit | Window |
  | ------- | ----------------------------------------------------- | ----- | ------ |
  | read    | `GET`/`HEAD` under `/api`, except `/api/health`       | 120   | 1 min  |
  | write   | non-GET under `/api`, except `/api/auth/login`        | 60    | 1 min  |
  | login   | failed `POST /api/auth/login` (successes not counted) | 5     | 15 min |

  Over the limit: 429 `{ status: 429, message: "Too many requests — try again in a moment", retryAfterSeconds }`
  with `Retry-After` and the standard `RateLimit` headers.

- `GET /api/*` responses: `Cache-Control: no-cache` with Express's default weak
  ETag, so a repeat request is a 304 with an empty body. `/api/auth/*`: `no-store`.
- Static files: `client/dist/assets/*` (content-hashed) `public, max-age=31536000, immutable`;
  `index.html` and the SPA fallback `no-cache`.
- `server.headersTimeout = 10_000`, `server.requestTimeout = 30_000` in `index.ts`.
- Error logging: 4xx → one `warn` line (method, path, status, message), no stack;
  5xx → `error` with stack, as today.

### 5. Client

- **Session**: `useSession()` wraps `GET /api/auth/me` (TanStack Query key
  `['session']`). `isAdmin` decides whether New Recipe, Edit, Delete, Manage
  ingredients, the classify modal and the collection add/remove/delete controls
  render; logged out, `StarRating` is read-only.
- **Login**: route `/login` (lazy-loaded) with username and password fields,
  labelled inputs, one error line for 401 / 429 / 503, and a `returnTo` query
  parameter (internal paths only). Header shows "Log in" or "Log out".
- **401 on a mutation**: invalidate `['session']` and navigate to
  `/login?returnTo=<current path and query>`.
- **429 anywhere**: show the server's message; no automatic retry (TanStack `retry`
  returns false for 4xx).
- **Infinite scroll**: `useInfiniteQuery` with `getNextPageParam: (p) => p.nextOffset`;
  the query key is the filters, so a filter change starts again at offset 0. A
  sentinel element under the grid is watched by an `IntersectionObserver`
  (`rootMargin: 600px`); when visible, and no page is in flight, and the last page
  did not fail, it loads the next page. The "Show more" button is the same trigger;
  it shows "Try again" after an error and disappears when `nextOffset` is null. The
  result count reads "Showing 24 of 312 recipes" in an `aria-live="polite"` region.
  `RecipeCard` is memoised so appending a page renders only the new cards.

### 6. Deployment

- `compose.prod.yaml`: service `cocktail` (the existing image), `env_file: .env`,
  volume `cocktail-db:/data`, network `${CADDY_NETWORK:-caddy}` declared
  `external: true`, **no `ports:`**, `restart: unless-stopped`, existing health check.
- `.env.example` documents `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`,
  `SESSION_TTL_DAYS`, `TRUST_PROXY_HOPS`, `CADDY_NETWORK`, and that `CLIENT_ORIGIN`
  must be the public `https://` URL in production.
- `docs/deploy.md`: the Caddy site block
  (`<domain> { encode zstd gzip  reverse_proxy cocktail:3000 }`), generating the
  password hash, first start, update, smoke checks (`/api/health` 200; an
  unauthenticated `POST /api/recipes` 401 — or 403 without an `Origin`; a compressed
  response through Caddy), and the botnet caveat.
- `docker-compose.yml` stays for local runs and gains the admin variables.

## Error cases

| Case                                                           | Response                                                    |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| Query or body over a limit, malformed, or a repeated query key | 400 `{ status, message, errors[] }` via `lib/validation.ts` |
| Write without a session, or with an expired one                | 401                                                         |
| Non-GET with a missing or foreign `Origin`                     | 403                                                         |
| Unknown recipe / collection                                    | 404 (unchanged)                                             |
| Rate limit exceeded                                            | 429 + `Retry-After`                                         |
| Login with admin not configured (dev/test only)                | 503                                                         |
| Production start without admin variables                       | process exits with the env validation error                 |
| `offset` beyond the end                                        | 200 with empty `items`                                      |

## Efficiency budget

| Resource                   | Budget (number)                                                                                                                                                                                                        | How the design meets it                                                                          | How it is verified                                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Network per action         | First page and each further page ≤ 15 KB uncompressed and ≤ 5 KB through Caddy compression (24 recipes); a repeated identical request is a 304 with an empty body                                                      | `limit` 24 (max 48); ETag + `no-cache`; Caddy `encode`                                           | Server test: seeded 24-recipe page body < 15,000 bytes, `If-None-Match` → 304. Compressed size measured with `curl --compressed` on the deployed site, recorded in the deployment PR    |
| Network while idle         | 0 requests while the list is open and nobody scrolls or changes a filter; at most 1 request per window focus, answered 304                                                                                             | No polling or `refetchInterval`; the observer only fires near the end of the list                | e2e: count `/api` requests over 5 s of idle after load = 0                                                                                                                              |
| Location / sensors         | n/a — the web client uses no sensors                                                                                                                                                                                   | —                                                                                                | —                                                                                                                                                                                       |
| CPU / server               | Worst legal filter (20 include + 20 exclude + only-these + `sortBy=ingredientCount`, `limit` 48) ≤ 30 ms at 1,000 recipes; typical filter ≤ 5 ms; `/api/health` p95 ≤ 50 ms while one IP floods the worst legal filter | D7 limits, D8 pagination, D10 read limiter                                                       | `scripts/load-probe.mjs` (committed) against the production build with 1,000 seeded recipes; numbers in each PR that touches the read path. Unit tests pin every limit (21 terms → 400) |
| Rendering                  | Appending a page renders only the new cards; no scroll event listeners                                                                                                                                                 | `IntersectionObserver`; memoised `RecipeCard` keyed by id                                        | Client test: render count of existing cards unchanged after a page appends                                                                                                              |
| Battery                    | n/a as a separate row — the client keeps no timers, polling or scroll handlers (see the idle row)                                                                                                                      | —                                                                                                | —                                                                                                                                                                                       |
| Startup / memory / storage | Client JS ≤ 106 KB gzip (baseline 100.2 KB on 2026-10-16), login page lazy-loaded; rate-limit memory bounded by active IPs per window; `sessions` rows ≤ logins in the last `SESSION_TTL_DAYS`                         | `React.lazy` login route; library expires entries per window; purge of expired sessions on login | Bundle measured (`gzip -9c … \| wc -c`) in each client PR; server test: an expired session row is deleted on the next login                                                             |

## Testing bar

- **Server (Vitest + supertest)**: each limit at its edge and one over (pass / 400);
  repeated query key → 400; pagination (first, middle, last, past-the-end, stable
  order with equal sort keys, collection filter, 1,000+ rows without error);
  `/auth/login` success, wrong user, wrong password, 429 after 5 failures, 503 when
  unconfigured; cookie flags per environment; `/auth/me` both states; logout
  revokes; expired session → 401; every one of the 9 write routes → 401 without a
  session, 403 with a foreign or missing `Origin`, success with a session; each
  limiter at its limit; cache headers; 4xx log line without stack; production
  start fails without admin variables; `hash-password` round-trip with the verifier.
- **Client (Vitest + RTL)**: admin controls hidden/shown by session; read-only
  stars; login form (labels, errors, `returnTo` only internal); 401 → login
  redirect; 429 message, no retry; infinite list (observer stub: loads next page,
  one in flight, stops on error, "Try again", hidden at end, count text); 20-term
  cap in the picker; render-count test.
- **e2e (Playwright)**: existing journeys updated to log in where they write;
  new: log in → create → log out → edit controls gone; scroll a 60-recipe set to
  the end; idle request count. The e2e server gets a throwaway admin hash in
  `playwright.config.ts` (test-only credentials, never used elsewhere).
- Coverage stays ≥ 80 % in both workspaces; knip, lint and typecheck clean.

## Delivery

Before feature work: `chore/deps-2026-10-16` (`npm audit fix` for the critical
dev-only advisory, compatible patch/minor updates), its own PR.

Then one branch per step, each a PR into `develop`, each leaving `develop`
shippable:

1. `feat/query-limits` — shared and write limits, body limit, 4xx logging, picker
   cap, `scripts/load-probe.mjs`, budget measurement.
2. `feat/paginated-list` — pagination contract, server and client infinite scroll
   together (the response shape changes, so both sides move at once).
3. `feat/admin-login` — env, migration 5, hash script, auth endpoints, session
   middleware, login page and header; writes not yet guarded.
4. `feat/guard-writes` — `sameOrigin` and `requireAdmin` on the 9 routes, client
   hides controls, 401 redirect, e2e logs in.
5. `feat/rate-limits-and-caching` — limiters, `trust proxy`, cache headers,
   timeouts, client 429 handling.
6. `feat/deploy-behind-caddy` — `compose.prod.yaml`, `.env.example`,
   `docs/deploy.md`, compressed-size measurement.

If the worst-case measurement in branch 1 misses 30 ms, that branch also adds a
small LRU cache of prepared statements keyed by SQL text; otherwise none is added.

## Out of scope

Multiple users, sign-up, password reset, 2FA; database backups; monitoring and
alerting; protection against distributed floods (VPS provider / Caddy level);
changing the owner's Caddy; full-text search or indexes for substring matching;
offline support.
