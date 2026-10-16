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

## Current status & next steps (updated 2026-10-15)

The app is feature-complete for its first scope: cocktail/mocktail tabs,
ingredient include/exclude/"only these" filtering, search, rating, sorting, full
CRUD, ingredient classification, collections and the ml ⇄ oz toggle. `main` CI
is green (last run 2026-09-22). `develop` was branched from `main` on 2026-10-15.

Checked on 2026-10-15: `npm run verify` green (server 117 tests, 97.8% lines;
client 193 tests, 92.2% lines); the Docker image builds (356 MB), starts
healthy, applies migrations 1–4 and serves the seeded recipes. On 2026-10-16
`npm run e2e` passed locally (6/6).

**Open items:**

- **Dependencies (2026-10-16):** the dev advisories are fixed and every
  compatible patch/minor update is in (`chore/deps-2026-10-16`); `npm audit` is
  clean. Major PRs to weigh: `concurrently` 10,
  `better-sqlite3` 13 (+ `@types/better-sqlite3` 9), `eslint-plugin-react-hooks`
  7, `globals` 17, `@types/supertest` 7, TypeScript 6.0, GitHub Actions
  `checkout`/`setup-node`/`upload-artifact` v4 → v7.
- The Vite dev proxy target is hard-coded to port 3000 instead of following
  `PORT`.
- `.gitignore` lists `.github/skills/`, yet `react-components/SKILL.md` is
  tracked, and that skill still says "React 18".
- e18e analyze flags the `exports` field in `packages/shared/package.json` as
  ignored by Node — a false positive for a workspace package that Node resolves
  through `node_modules`; keep it.

## Not yet set up (intentional)

Authentication, user accounts, hosted deployment. Don't add these unless asked.
