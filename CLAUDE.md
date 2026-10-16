# CLAUDE.md — Cocktail Recipes

Guidance for Claude Code when working in this repository.

## What this is

A cocktail and mocktail recipe manager. npm workspaces monorepo: Express 5 +
SQLite on the back, React 19 + Vite 8 on the front, the API contract defined once
in `packages/shared` as zod schemas.

```
packages/shared/          zod schemas + inferred types (the contract)
server/                   Express API — routes → services → stores, numbered migrations
client/                   React app — features/Recipes, TanStack Query, URL filter state
e2e/                      Playwright journeys against the production build
docs/superpowers/specs/   design specs, one per feature
docs/superpowers/plans/   implementation plans, one per spec
```

## How we work

**`AGENTS.md` holds the working contract — process, gating commands, definition
of done — and `AGENT.md` holds the stack, every build command and the code
conventions. Both apply to Claude Code. Read them before changing code.** In
short: brainstorm, then a spec in `docs/superpowers/specs/`, then a plan in
`docs/superpowers/plans/` broken into small branches and test-first tasks, specs
and plans pushed straight to `develop`, one feature branch per plan step PR'd
into `develop` and merged by a human (`develop` → `main` on release), with an
independent review of every task and a broader one per branch.

In Claude Code that maps onto the superpowers skills: `brainstorming` →
`writing-plans` → `subagent-driven-development` (one agent per feature — one
feature per plan branch — with the context checked at every feature boundary, a
review between tasks, a whole-branch review at the end), with
`test-driven-development` and `verification-before-completion` throughout. Every
session starts with `checking-dependency-freshness`; every spec, plan and review
uses `setting-efficiency-budgets`. Component work follows the project skill
`.github/skills/react-components/SKILL.md`.

## Commands

See `AGENT.md` for the full list and `AGENTS.md` for the gates. The short version:

```bash
npm ci                 # install every workspace
npm run dev            # API on :3000 + Vite on :5173 (see "Local environment")
npm run verify         # format, lint, typecheck, knip, tests + 80% coverage — what CI runs
npm run e2e            # Playwright against the production build on :3100
docker build -t cocktail . && docker run -p 3105:3000 cocktail   # image smoke test
```

## Local environment (this machine)

- **GitHub CLI:** `gh` (account `lolmop103`); if it is not on the PATH, call
  `C:\Program Files\GitHub CLI\gh.exe`. PRs go into `develop`.
- **Node 24.21 / npm 11.19 locally**, while the project targets Node 22 (CI,
  Docker `node:22-alpine`, `@types/node` 22). `engines` is `>=22`, so this works;
  remember that CI runs 22.
- **Port 3000 is taken** by another Node process on this machine. `npm run dev`
  needs `PORT` in `.env` set to a free port, and the Vite proxy target in
  `client/vite.config.ts` is hard-coded to `http://localhost:3000` — see the open
  items. Run the Docker image on another host port (`-p 3105:3000`).
- **npm 11 `allowScripts`:** `npm ci` warns that the install scripts of
  `better-sqlite3` and `esbuild` are not covered; on 2026-10-15 both native
  binaries were present after `npm ci` anyway.
- **Playwright browsers** live in `%LOCALAPPDATA%\ms-playwright`. Inside an agent
  sandbox the download from `cdn.playwright.dev` can time out; install them from
  a normal terminal with `npx playwright install chromium`.
- **Docker** (29.x) is available for the image build.

## Versions held on purpose

Everything else is "latest stable and compatible", checked at the start of each
session (`checking-dependency-freshness`). Each hold, its reason and when to
revisit it:

| Package                         | Held at       | Reason                                                                                                                                                                       | Revisit when                                                                 |
| ------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `typescript`                    | below 6.1     | `typescript-eslint` 8.71 peers `typescript >=4.8.4 <6.1.0`, so TypeScript 7 is out (checked 2026-10-15). 6.0 is in range and is its own major-upgrade PR                     | `typescript-eslint` accepts TS 7                                             |
| `eslint`, `@eslint/js`          | 9             | `eslint-plugin-jsx-a11y` 6.10.2 peers `eslint ^3 … ^9`, so ESLint 10 is out (checked 2026-10-15)                                                                             | `eslint-plugin-jsx-a11y` accepts ESLint 10                                   |
| `@types/node`                   | 22            | Follows the Node 22 runtime of CI and the Docker image                                                                                                                       | the runtime moves to Node 24                                                 |
| Docker `node:22-alpine`         | 22            | Same runtime as CI (`node-version: 22`)                                                                                                                                      | the runtime moves to Node 24                                                 |
| `vitest`, `@vitest/coverage-v8` | exactly 5.0.4 | 5.0.5 changed the `Assertion` type so `@testing-library/jest-dom/vitest` no longer augments it; client `tsc` and lint fail on every `toBeInTheDocument` (checked 2026-10-16) | a `vitest` or `@testing-library/jest-dom` release restores the matcher types |

## Current status & next steps (updated 2026-10-16)

The first scope is complete (cocktail/mocktail tabs, include/exclude/"only
these" filtering, search, rating, sorting, CRUD, classification, collections,
ml ⇄ oz). On 2026-10-16 the production-hardening plan
(`docs/superpowers/specs/2026-10-16-production-hardening-design.md`, plan in
`docs/superpowers/plans/`) was implemented in PRs #3–#9 (#3–#5 and #7 merged on
2026-10-16; the rest awaiting review): one admin login
with server-side sessions, writes guarded (session + Origin), bounded filters,
paginated list with infinite scroll, per-IP rate limits, cache headers and
timeouts, and `compose.prod.yaml` + `docs/deploy.md` for running behind the
owner's Caddy.

Checked on 2026-10-16: `npm run verify` green (server 277 tests, client 276),
`npm run e2e` 10/10, the production compose stack smoke-tested on a private
network (no published ports, health 200, anonymous write 401, cross-site write
403, `__Host-` Secure session cookie). `npm run probe`: worst filter ≤ 30 ms
and health p95 during a single-IP flood 15–28 ms (387 ms without the limiter).

**Open items:**

- **Re-measure `npm run probe` on the VPS.** The typical-filter row (budget
  ≤ 5 ms) measured 2.6–3.5 ms in the morning and 8–10 ms in the afternoon of
  2026-10-16 on unchanged code (the machine itself slowed). If it misses on the
  VPS: skip the COUNT on later pages, or loosen the row with a reason.
- **Dependencies (2026-10-16):** `npm audit` clean. Major PRs to weigh:
  `concurrently` 10, `better-sqlite3` 13 (+ `@types/better-sqlite3` 9),
  `eslint-plugin-react-hooks` 7, `globals` 17, `@types/supertest` 7,
  TypeScript 6.0, GitHub Actions v4 → v7.
- The Vite dev proxy target is hard-coded to port 3000 instead of following
  `PORT`.
- `.gitignore` lists `.github/skills/`, yet `react-components/SKILL.md` is
  tracked, and that skill still says "React 18".
- e18e analyze flags the `exports` field in `packages/shared/package.json` as
  ignored by Node — a false positive for a workspace package; keep it.
- **Review findings deferred on 2026-10-16** (minor; each was judged not to hurt
  a visitor today):
  - Filters: the picker at 20 terms keeps its listbox open (a 21st click is
    clamped away, focus drops to `<body>`); the search box has no
    `maxLength`; no contract test that `buildQuery(clampFilters(url))` always
    passes the server schema.
  - List: no guard for a page with 0 items but a `nextOffset` (the server cannot
    produce one); "Showing 0 of 0" is announced before the first page; returning
    to a stale filter refetches every cached page.
  - Login: production accepts the public low-cost test hash (and the
    playwright.config comment "never used elsewhere" is wrong); any scrypt N/r/p
    is accepted, so an unusable hash makes every login a silent 401; logging in
    again leaves the previous session row valid; `useLogout` does not refresh
    the list and has no error feedback.
  - Guards: `sameOrigin` exempts OPTIONS, which `cors` already answers; the
    session-expired hook reacts to every `updated` event of a failed mutation
    (N classify calls → N session refetches).
  - Limits and caching: the `assets/` cache check runs on the absolute path (a
    checkout under a directory named "assets" would cache `index.html` for a
    year; Docker's `/app` is safe); the timeouts comment overstates
    `requestTimeout`; a 429 on `/api/auth/me` hides the admin's controls until
    the next successful check.

## Not yet set up (intentional)

More than one user, sign-up, password reset, 2FA, database backups, monitoring,
and protection against floods from many IP addresses (that belongs in front of
the app). Don't add these unless asked.
