# Handoff
<!-- Updated ∀stop — §6 format -->

## Objective
Code-review remediation pass across the whole stack: correctness defects, tooling
gaps, data-layer performance, and accessibility.

## State
- Completed:
  - **Tooling**: ESLint 9 flat configs (typed, react-hooks, jsx-a11y) for both
    workspaces — previously `npm run lint` failed outright with no config at all.
    Prettier installed + configured. CRLF→LF and BOM stripped across all sources.
    Server tsconfig split (`tsconfig.json` for lint/typecheck incl. tests,
    `tsconfig.build.json` for emit). Server is nowtrue ESM (`"type": "module"`).
  - **CI**: `.github/workflows/` contained 11 workflows belonging to the
    an unrelated .NET repository. Moved to `.github/` (since removed)
    and replaced with a real `ci.yml` (format → lint → typecheck → test → build,
    plus a Docker build and container smoke test).
  - **Correctness**: clearable optional fields on edit (null vs absent); ids no
    longer reused after delete (`data/ids.ts`); search debounced + AbortController
    so stale responses cannot overwrite newer ones; create/update refetch instead
    of blindly appending; delete no longer leaves an unhandled rejection; React
    key collisions fixed; unknown `/api/*` returns JSON 404 instead of being
    swallowed by the SPA fallback; Zod internals no longer leak to clients.
  - **Data layer**: `db.ts` split into `connection` / `schema` / `seed` / `ids`;
    `rowToRecipe` no longer prepares a statement per row (N+1 → 2 queries);
    indexes added on the columns filters actually use.
  - **Server conventions**: `lib/logger.ts` (structured, `no-console` enforced
    elsewhere) and `config/env.ts` (zod-validated at startup) — both were
    mandated by AGENT.md but absent.
  - **Accessibility**: `:focus-visible` rings restored (9 × `outline: none` had
    no replacement); combobox keyboard navigation with `aria-activedescendant`;
    tablist roving tabindex + `aria-controls` + a real tabpanel; modal focus trap
    and focus restoration; `prefers-reduced-motion`.
  - **Docker**: compiler toolchain out of the runtime image via a deps stage,
    runs as `node`, `HEALTHCHECK` added, `DATA_DIR` defaulted to the volume path.
- In progress: —
- Blocked: —

- **Dead-code and dead-test gates** (follow-up, 2026-09-19): `@vitest/eslint-plugin`
    enforces the no-`.skip`/no-`.only`/must-assert rules AGENT.md already claimed;
    `knip` gates unused files, exports and dependencies. Both wired into CI and
    into a single `npm run verify`. First run found and removed: an unused
    `@testing-library/user-event` dependency, an undeclared `@eslint/js`, a dead
    `resetDb` re-export, an over-exported `rowFromIngredient`, and an unused
    `ApiError` — the last of which is now used to surface server field errors
    in the recipe form rather than being deleted.

- **Test coverage** (follow-up, 2026-09-19): client coverage was 57.9% against a
    declared 80% threshold that nothing enforced. Added 77 tests across
    `api.ts`, `useRecipes`, `useUnit`, `useModal`, `RecipeTabs`, `UnitToggle`,
    `ErrorBoundary`, `ClassifyIngredientsModal`, `ManageIngredientsPanel` and a
    `Recipes` integration suite. Client is now 95.9% stmts / 90.0% branches /
    82.9% funcs, server 94.9% / 83.2% / 83.7%, and CI runs `test:coverage` so the
    threshold is finally real. Two defects surfaced while writing them:
    (a) `useRecipes` shared one error slot between the list fetch and everything
    else, so a failed ingredient load was silently erased by the next successful
    recipe load — now split into `listError` / `sideError`;
    (b) the tag checkboxes used `display: none`, which removed them from the tab
    order and the accessibility tree entirely — the tag selector was
    keyboard-unreachable. Replaced with the visually-hidden pattern.

- **Architecture pass** (2026-09-20): closed the four gaps an architecture review
    would flag.
    1. **Shared contract** — new `packages/shared` workspace holds the zod
       schemas; `z.infer` gives the types. `Recipe`/`Ingredient`/`Collection`/
       `IngredientMeta` were previously declared twice and hand-synced. The
       client imports them with `import type`, so zod stays out of the bundle.
    2. **Migrations** — `server/src/data/migrations/` plus a `schema_migrations`
       ledger, each migration in its own transaction. Migration 004 rebuilds
       `collection_recipes` to add the recipe foreign key that
       `CREATE TABLE IF NOT EXISTS` could never apply to a live database.
       Verified against the real dev database: 8 recipes intact, FK present.
    3. **TanStack Query** — replaces the hand-rolled `useRecipes`. Cancellation,
       caching and invalidation come from the library; the `reloadToken`
       counter (a homemade `invalidateQueries`) is gone.
    4. **React Router** — `/cocktails` and `/mocktails` are routes, and filters
       live in the query string, so any filtered view is linkable.
    Also: `AppError`/`NotFoundError`/`ValidationError` (restoring the AGENT.md
    requirement that had been deleted rather than implemented), and a real
    service layer so routes no longer orchestrate three stores each.

- **Exclude filter** (2026-09-20): the server's `excludeIngredients` finally has
    a UI — a "Without" picker beside the include one, backed by an `exclude` URL
    param. The two pickers hide each other's choices, since requiring and
    excluding the same ingredient can only ever return nothing. Building it
    surfaced a latent bug: tab navigation read `window.location.search` instead
    of the router's location, which drops the query string under any
    non-browser history; now uses `useLocation()` and is pinned by a test.

- **Docker** (2026-09-21): the image now builds, boots and serves. The failure
    was `npm rebuild`: `npm ci --ignore-scripts` correctly skipped the shared
    workspace's `prepare` hook, but `npm rebuild` re-runs it on any tree
    mutation, and `prepare` needs tsc — absent under `--omit=dev`. Resolved by
    dropping the separate production-install stage: the builder installs
    everything, builds, then `npm prune --omit=dev`, which is the one ordering
    where the hook can still succeed. Verified locally: build passes, container
    reports healthy, 8 seeded recipes served, SPA deep links resolve, runs as
    uid 1000 (node), 342MB, and data survives container replacement on a
    mounted volume. The CI job is restored.
  - **Node 22** (2026-09-21): Node 20 reached end-of-life on 2026-04-30.
    Bumped the base image, CI and docs to 22 (LTS until 2027-04-30) and added
    `engines: { node: ">=22" }` to every package, which was previously absent.

- **Filtering moved into SQL** (2026-09-21): `recipeService.list` no longer
    loads every recipe and filters in JavaScript. `data/recipeQuery.ts` compiles
    the filters into a parameterised SELECT and `recipeStore.query` runs it,
    hydrating only the matched rows' ingredients instead of the whole table.
    Semantics are unchanged, including substring ingredient matching and the
    rating sort order; the old `filterAndSort` unit tests were replaced by 34
    cases that exercise the real SQL against the in-memory database.
    **Partial result, stated honestly:** `idx_recipes_name` is now used (the
    name sort no longer builds a temp B-tree), but
    `idx_recipe_ingredients_name` still is not and cannot be — ingredient
    filtering matches substrings, and SQLite cannot use an index for a LIKE
    pattern with a leading wildcard. Verified with EXPLAIN QUERY PLAN.

## Risks
- `collection_recipes.recipe_id` gained a FK in the schema, but
  `CREATE TABLE IF NOT EXISTS` cannot add it to a pre-existing database. New
  databases get the constraint; existing dev databases keep the old shape. The
  route-level guard (404 on unknown recipe) covers both.
- `RecipeFilters.excludeIngredients` is supported server-side and covered by
  tests, but still has no UI. Either build the control or drop the filter.

## Next Steps
1. Decide on `excludeIngredients`: expose it in the filter panel, or remove it.
2. Delete `.github/` (since removed) once confirmed unwanted.
3. Consider pushing filtering into SQL — `filterAndSort` still runs in JS over
   every row, so the new indexes are not yet earning their keep.

## Files Touched
- Tooling: `server/eslint.config.js`, `client/eslint.config.js`, `.prettierrc.json`,
  `.prettierignore`, `server/tsconfig.json`, `server/tsconfig.build.json`,
  `client/tsconfig.json`, all three `package.json`
- CI/Docker: `.github/workflows/ci.yml`, `Dockerfile`, `docker-compose.yml`
- Server: `app.ts`, `index.ts`, `config/env.ts`, `lib/logger.ts`, `lib/validation.ts`,
  `middleware/errorHandler.ts`, `data/{connection,schema,seed,ids,db,recipeStore,collectionStore,ingredientMetaStore}.ts`,
  `routes/{recipes,collections,ingredients}.ts`, `types/recipe.ts`
- Client: `App.tsx`, `components/ErrorBoundary.tsx`, `features/Recipes/index.tsx`,
  `hooks/{useRecipes,useCollections,useUnit,useModal,useListboxKeyboard,useDismissable}.ts`,
  `components/{AddRecipeModal,IngredientNameInput,recipeForm,IngredientSelector,RecipeCard,RecipeTabs,CollectionPicker,ClassifyIngredientsModal}.tsx`,
  `services/api.ts`, `types/index.ts`, `utils/units.ts`, `index.css`
- Tests: `server/tests/regressions.test.ts` (new), `client/tests/recipeForm.test.ts` (new),
  `client/tests/IngredientSelectorKeyboard.test.tsx` (new)
- Docs: `AGENT.md`, `README.md`, `.env.example`, `.gitignore`

## Tools/Skills Used
code-review · refactoring · security-audit

## Gate Status
- §4a: pass — format, lint, typecheck, test, build all green
- §4b: pass — 127 tests (68 server / 59 client), production build boots and
  serves the SPA; verified end to end against a real container-shaped run

## Review Status
1 cycle completed (review → remediation → verification)

## Branch: #1

## Uncommitted Changes: all of the above (repository is not under git)
