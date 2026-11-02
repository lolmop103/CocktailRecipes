# AGENTS.md — Cocktail Recipes

The contract for any coding agent working in this repository, whatever tool it
runs in. Claude Code reads `CLAUDE.md` as well; everything below applies there too.

This file holds the **process**. The stack, the build commands, the code
conventions and the prohibited list live in [`AGENT.md`](AGENT.md) and are part
of this contract — read both before changing code.

## What Cocktail Recipes is

A cocktail and mocktail recipe manager: browse what you can make, filter by the
bottles you own, rate what you have tried, group recipes into collections. A
full-stack TypeScript monorepo with the API contract defined once and consumed
by both sides.

```
packages/shared/          the API contract: zod schemas + inferred types
server/                   Node.js / Express 5 API, SQLite via better-sqlite3
client/                   React 19 + Vite 8 frontend, TanStack Query, React Router 7
e2e/                      Playwright journeys against the production build
docs/superpowers/specs/   design specs, one per feature, dated
docs/superpowers/plans/   implementation plans, one per spec, dated
```

## How we work

This process is not optional. It is what keeps a large change reviewable.

0. **Start the first session of the day with a dependency check** (skill
   `checking-dependency-freshness`): `pnpm outdated -r` and `pnpm audit` at the repo
   root (it covers every workspace), the `node:` image tag in the `Dockerfile`,
   the action versions in `.github/workflows/ci.yml`, and e18e
   (`pnpm dlx @e18e/cli analyze`; the `@e18e/eslint-plugin` recommended config is
   already active in every workspace). Holds are justified only by the "Versions
   held on purpose" list in `CLAUDE.md`. Report, then continue the real work;
   upgrades go to a `chore/deps-<date>` branch, never into a feature branch.
1. **Brainstorm before building.** For anything beyond a one-file fix, agree the
   design in conversation first: purpose, constraints, the decisions and their
   trade-offs. Do not start editing code during this step.
2. **Write a spec.** `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, with a
   "Decisions (locked)" table giving each choice and its rationale, the data
   model and migration, the API surface (zod schemas in `packages/shared`), the
   error cases, an **Efficiency budget** (skill `setting-efficiency-budgets`:
   requests per user action and while idle, payload sizes, client bundle size,
   rendering and re-renders on long lists, time to first render — a number and
   a check per row), the testing bar, and an explicit out-of-scope list. Have a
   human review it before planning. Specs and plans are committed and pushed
   **directly to `develop`**, without a pull request.
3. **Write a plan.** `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`, broken into
   **branches** and, inside each, numbered **tasks**. Every task lists the exact
   files it touches, the interfaces it produces for later tasks, and bite-sized
   steps: write the failing test, run it and see it fail, implement, run it and
   see it pass, commit. No placeholders — a plan step contains the actual code.
4. **One small branch per plan step.** Cut it from `develop`, implement its
   tasks, push, open a PR into `develop`, and let a human merge before starting
   the next branch. `develop` must stay green and shippable after every merge; a
   human merges `develop` into `main` when it is time to release. Each plan step
   is one feature, built by one agent; before each feature, decide whether the
   working context is still good, should be renewed, or should be combined with
   the next step, and say which.
5. **Test-driven, always.** Write the test first and watch it fail for the right
   reason. A task is not done because the code exists; it is done when its tests
   pass and the suites below are green.
6. **Review every task.** An independent pass over the diff against the task's
   requirements, separate from whoever wrote it. Fix what it finds, then re-check
   the fix. Run a broader review over the whole branch before the PR.
7. **Verify before claiming.** Never report work as complete without running the
   commands and reading the output. If something is skipped or failing, say so.

Decisions taken on a human's behalf mid-plan get recorded with their reasoning
and what they cost if wrong, and surfaced in the PR — not buried.

Commits, pushes and pull requests carry the human author's name only: no
`Co-Authored-By` trailer for an agent, no "Generated with ..." line, no session
link, no mention of AI tooling.

This repository is public. Never commit references to an employer, its internal
modules, solution names or private component libraries, or to private
repositories. Agent bookkeeping (`tasks/`, `kb/`) stays local and gitignored.

## Commands

The full list is in `AGENT.md`. The ones that gate a change:

| Task                            | Command                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Install                         | `pnpm install --frozen-lockfile` (or `pnpm add` / `pnpm update` when changing dependencies)                                     |
| Everything CI's verify job runs | `pnpm verify` — format check, lint, typecheck, knip, tests with the 80% coverage gate                                           |
| Build                           | `pnpm build`                                                                                                                    |
| End-to-end                      | `pnpm e2e` (builds, serves the production bundle on :3100, drives Chromium; needs `pnpm exec playwright install chromium` once) |
| Docker image                    | `docker build -t cocktail .` then run it and hit `/api/health`                                                                  |

## Definition of done

- `pnpm verify` is green: Prettier clean, ESLint at 0 warnings, `tsc` clean in
  every workspace, knip reports nothing, Vitest passes with coverage at or above
  80% in both `server` and `client`.
- `pnpm build` succeeds and `pnpm e2e` is green.
- Every new endpoint has a server test; every new component, form helper, hook
  and util has a unit test; a new user journey gets a Playwright spec in `e2e/`.
- Wire types change only in `packages/shared`.
- Schema changes: a new numbered migration in `server/src/data/migrations/`;
  released migrations are never edited, and existing data is preserved.
- Efficiency: every budget row the change touches is checked — by its test, or
  by a measurement recorded in the PR. A new request, polling interval, timer or
  large payload without a budget row is a review finding.
- Commits: Conventional Commits (`feat(server):`, `fix(client):`,
  `test(e2e):`, `refactor(shared):`, `docs:`, `chore:`). Never bypass hooks.

## Conventions

All code conventions — layering, the shared contract, TanStack Query and URL
state, component shape, tests, error handling, env vars, ids, partial updates,
accessibility — are in `AGENT.md`. Component structure has its own skill in
`.github/skills/react-components/SKILL.md`.

## Not set up on purpose

More than one user, sign-up, password reset, 2FA, database backups, monitoring,
and flood protection in front of the app. The single-owner admin login and the
deployment behind Caddy exist (`docs/deploy.md`). Each further piece arrives
through its own spec and plan; do not add it unless asked.
