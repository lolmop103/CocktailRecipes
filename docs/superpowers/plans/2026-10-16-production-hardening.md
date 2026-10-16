# Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone can browse and filter recipes; only the owner, logged in, can change them; no read request or single IP can make the server slow or unavailable.

**Architecture:** Hard limits in the shared zod contract bound the cost of every request; offset pagination bounds every response; a server-side session (SQLite `sessions` table, `HttpOnly` cookie) guards the 9 write routes together with an `Origin` check; in-app per-IP rate limiting sits behind the owner's own Caddy, which does HTTPS and compression.

**Tech Stack:** Node 22, Express 5, better-sqlite3, zod 4, React 19, TanStack Query 5, Vite 8, Vitest 5, Playwright, `express-rate-limit` 8 (new), Node `crypto.scrypt`.

**Spec:** `docs/superpowers/specs/2026-10-16-production-hardening-design.md`

## Global Constraints

- Every rule in `AGENT.md` applies (arrow-const components with `interface Props`, one component per file, logic in sibling `*.ts`, `Method_Scenario_Expected` test names, AAA, no `.only`/`.skip`, `lib/logger.ts` only, `env` never `process.env`, named constants, no `TODO`).
- Query limits: `search` ≤ 100 chars; `ingredients` / `excludeIngredients` ≤ 20 terms each after split, trim, empty-removal and case-insensitive de-duplication, each term 1–60 chars; `collectionId` digits only, ≤ 12 chars; `limit` 1–48, default 24; `offset` 0–100,000, default 0; `isMocktail`, `onlySelectedIngredients` only `"true"`/`"false"`.
- Write limits: recipe `name` 1–120, `instructions` ≤ 5,000, `glassType` ≤ 40, `tags` ≤ 20 × 1–30 chars, `ingredients` 1–40 × (`name` 1–60, `amount` ≤ 30); collection `name` 1–60; ingredient name in `PATCH /api/ingredients/:name` 1–60. JSON body limit 64 KB; no `urlencoded` parser.
- Session cookie: production `__Host-cocktail_session` with `Secure; HttpOnly; SameSite=Strict; Path=/`; development/test `cocktail_session`, same flags without `Secure`. TTL `SESSION_TTL_DAYS`, default 30. Token: 32 random bytes, base64url; stored as hex SHA-256 only.
- Password hash format: `scrypt$<N>$<r>$<p>$<salt b64>$<key b64>`; new hashes use N=32768, r=8, p=1, 16-byte salt, 64-byte key; verification reads N/r/p from the string.
- Rate limits per IP: reads (`GET`/`HEAD` under `/api` except `/api/health`) 120/min; writes (non-GET under `/api` except `/api/auth/login`) 60/min; failed logins 5/15 min. 429 body `{ status: 429, message: "Too many requests — try again in a moment", retryAfterSeconds }`.
- Error copy, exact: 401 `"Log in to make changes"`; login 401 `"Wrong username or password"`; 503 `"Admin login is not configured"`; 403 `"Cross-site request refused"`.
- Budgets (spec "Efficiency budget"): page ≤ 15,000 bytes uncompressed for 24 recipes; repeat GET → 304; 0 `/api` requests while idle; worst legal filter ≤ 30 ms at 1,000 recipes; typical filter ≤ 5 ms; `/api/health` p95 ≤ 50 ms during a single-IP flood; client JS ≤ 106 KB gzip.
- Commits: Conventional Commits; human author only, no AI trailers or mentions.
- Every branch is cut from `develop`, ends green on `npm run verify` and `npm run e2e`, and is PR'd into `develop` for a human to merge before the next branch starts.

## Review Focus

- A bookmarked or hand-edited URL with more than 20 ingredients, or an old value like `isMocktail=yes`, must still open the page (client trims to the limits before requesting) rather than show "Could not load recipes" — pinned in Task 1.4.
- Changing a filter while page 2 is still loading must never append the old filter's page to the new results — pinned in Task 2.2.
- Creating or deleting a recipe while scrolled to page 3 must not render the same recipe twice (offsets shift) — flattening de-duplicates by id, pinned in Task 2.2.
- An admin whose session expires with the edit dialog open must not lose what they typed to an automatic navigation: a 401 shows a "session expired" banner with a log-in link and leaves the dialog open — pinned in Task 4.2 (refines the spec's "navigate to /login", which would unmount the dialog).
- A client sending its own `X-Forwarded-For` must not escape the rate limiter by rotating the left-most address; with one trusted hop only the address Caddy appended counts — pinned in Task 5.1.

## File Structure

```
packages/shared/src/limits.ts                    NEW  all numeric limits; zod-free, exported as "@cocktail/shared/limits"
packages/shared/src/schemas/recipe.ts            MOD  capped query schema (parses lists/booleans), write caps, RecipePage
packages/shared/src/schemas/collection.ts        MOD  name cap
packages/shared/src/schemas/ingredient.ts        MOD  ingredientNameParamSchema
packages/shared/src/schemas/auth.ts              NEW  loginSchema, SessionInfo
server/src/data/recipeQuery.ts                   MOD  LIMIT/OFFSET, COUNT, id tie-breaker
server/src/data/recipeStore.ts                   MOD  query() → { items, total }
server/src/data/sessionStore.ts                  NEW  sessions table access
server/src/data/migrations/index.ts              MOD  m005_sessions
server/src/lib/password.ts                       NEW  hashPassword / verifyPassword
server/src/lib/cookies.ts                        NEW  readCookie, session cookie name/options
server/src/lib/errors.ts                         MOD  Unauthorized/Forbidden/ServiceUnavailable
server/src/lib/serverTimeouts.ts                 NEW  applyServerTimeouts
server/src/services/authService.ts               NEW  login / logout / sessionFor
server/src/services/recipeService.ts             MOD  list() → RecipePage; toFilters removed
server/src/middleware/session.ts                 NEW  sets req.admin
server/src/middleware/requireAdmin.ts            NEW  401 guard
server/src/middleware/sameOrigin.ts              NEW  403 guard
server/src/middleware/rateLimits.ts              NEW  createRateLimiters
server/src/middleware/cacheHeaders.ts            NEW  API + static cache headers
server/src/middleware/errorHandler.ts            MOD  4xx warn line
server/src/routes/auth.ts                        NEW  /api/auth/*
server/src/scripts/hashPassword.ts               NEW  `npm run hash-password` CLI
server/src/types/express.d.ts                    NEW  req.admin augmentation
server/src/config/env.ts                         MOD  admin, session, proxy vars
server/src/config/limits.ts                      NEW  rate-limit numbers
server/tests/helpers/admin.ts                    NEW  adminAgent()
client/src/lib/http.ts                           NEW  request/jsonInit/ApiError moved out of the Recipes feature
client/src/features/Auth/…                       NEW  authApi, useSession, LoginPage, AuthHeaderButton, SessionExpiredBanner, useUnauthorizedNotice
client/src/features/Recipes/components/LoadMore.tsx            NEW
client/src/features/Recipes/hooks/useLoadMoreOnVisible.ts      NEW
client/src/features/Recipes/utils/filterLimits.ts              NEW  clampFilters
client/src/features/Recipes/utils/pages.ts                     NEW  flattenPages
scripts/load-probe.mjs                           NEW  budget probe
e2e/helpers/login.ts, e2e/auth.spec.ts, e2e/infinite-scroll.spec.ts, e2e/idle.spec.ts   NEW
compose.prod.yaml, docs/deploy.md                NEW
```

---

## Branch 0 — `chore/deps-2026-10-16`

### Task 0.1: Fix the advisories and take compatible updates

**Files:** Modify `package.json`, `server/package.json`, `client/package.json`, `packages/shared/package.json`, `package-lock.json`, `CLAUDE.md` (status)

- [ ] **Step 1:** `git switch -c chore/deps-2026-10-16 develop`
- [ ] **Step 2:** `npm audit fix` — Expected: `shell-quote` 1.12.0, `source-map-js` 1.2.2, `smol-toml` 1.9.1; then `npm audit` → `found 0 vulnerabilities`.
- [ ] **Step 3:** Raise the ranges to the "Wanted" versions from `npm outdated` for every patch/minor row (`@playwright/test` 1.64.1, `@tanstack/react-query` 5.104.3, `@vitejs/plugin-react` 6.1.2, `@vitest/coverage-v8` 5.0.4, `express` 5.3.0, `jsdom` 30.1.3, `knip` 6.41.0, `prettier` 3.9.10, `react`/`react-dom` 19.3.1, `supertest` 7.3.1, `typescript-eslint` 8.71.2, `vite` 8.3.4, `vitest` 5.0.4, `zod` 4.6.7), `npm install`. No majors in this branch.
- [ ] **Step 4:** `npm run verify && npm run build` — Expected: all green, coverage ≥ 80 % both workspaces.
- [ ] **Step 5:** `npm run e2e` — Expected: 6 passed. (In an agent sandbox the browser download may fail; then run it from a normal terminal and record that in the PR.)
- [ ] **Step 6:** In `CLAUDE.md` "Open items", replace the dependency-check bullet with the remaining majors only. Commit `chore(deps): fix dev advisories and take compatible updates`, push, PR into `develop`.

---

## Branch 1 — `feat/query-limits`

### Task 1.1: Limits module and the capped query schema

**Files:**

- Create: `packages/shared/src/limits.ts`
- Modify: `packages/shared/package.json` (exports), `packages/shared/src/schemas/recipe.ts:56-88`, `server/src/services/recipeService.ts:14-38,52-54`
- Test: `server/tests/recipeQuerySchema.test.ts` (new), `server/tests/recipes.test.ts`

**Interfaces:**

- Produces: `@cocktail/shared/limits` exporting `MAX_FILTER_TERMS = 20`, `MAX_TERM_LENGTH = 60`, `MAX_SEARCH_LENGTH = 100`, `MAX_COLLECTION_ID_LENGTH = 12`, `PAGE_SIZE_DEFAULT = 24`, `PAGE_SIZE_MAX = 48`, `MAX_OFFSET = 100_000`, `RECIPE_NAME_MAX = 120`, `INSTRUCTIONS_MAX = 5_000`, `GLASS_TYPE_MAX = 40`, `TAGS_MAX = 20`, `TAG_LENGTH_MAX = 30`, `INGREDIENTS_MAX = 40`, `INGREDIENT_NAME_MAX = 60`, `AMOUNT_MAX = 30`, `COLLECTION_NAME_MAX = 60`. No zod import in this file (the client imports it as a value).
- Produces: `recipeQuerySchema` whose **output** is `RecipeQuery = RecipeFilters & { collectionId?: string }` — `ingredients` and `excludeIngredients` are `string[]` (always present, possibly empty), `onlySelectedIngredients` and `isMocktail` are booleans. `recipeService.list(query: RecipeQuery)` passes it straight to the store; `toFilters` and `splitList` are deleted.

- [ ] **Step 1: Write the failing tests** in `server/tests/recipeQuerySchema.test.ts`:

```ts
const parse = (q: Record<string, unknown>) => recipeQuerySchema.safeParse(q);
it('ingredients_twentyTerms_accepted', () => expect(parse({ ingredients: terms(20) }).success).toBe(true));
it('ingredients_twentyOneTerms_rejected', () => expect(parse({ ingredients: terms(21) }).success).toBe(false));
it('excludeIngredients_twentyOneTerms_rejected', …);
it('ingredients_duplicatesAndBlanks_collapsedBeforeCounting', () => {
  const r = parse({ ingredients: `${terms(20)},GIN0, ,gin0` });   // terms(n) = "gin0,gin1,…"
  expect(r.success && r.data.ingredients).toHaveLength(20);
});
it('ingredientTerm_sixtyOneChars_rejected', …);           // 'a'.repeat(61)
it('search_hundredOneChars_rejected', …);
it('collectionId_nonDigits_rejected', …);                 // '1 OR 1=1'
it('isMocktail_yes_rejected', …);                          // only 'true' | 'false'
it('onlySelectedIngredients_true_parsedToBoolean', …);     // data.onlySelectedIngredients === true
it('emptyQuery_defaultsToEmptyLists', …);                  // ingredients: [], excludeIngredients: []
```

And in `server/tests/recipes.test.ts`:

```ts
it('get_repeatedSearchKey_returns400', async () => {
  const res = await request(app).get('/api/recipes?search=a&search=b');
  expect(res.status).toBe(400);
});
it('get_twentyOneExcludeTerms_returns400NotSlow', async () => {
  const started = Date.now();
  const res = await request(app).get(`/api/recipes?excludeIngredients=${terms(21)}`);
  expect(res.status).toBe(400);
  expect(Date.now() - started).toBeLessThan(200);
});
```

- [ ] **Step 2:** `npm run test --workspace=server` — Expected: the new cases FAIL (schema accepts 21 terms, `search` arrays, `isMocktail=yes`).
- [ ] **Step 3:** Implement. Add `"./limits": { "types": "./dist/limits.d.ts", "default": "./dist/limits.js" }` to the shared `exports`. In `recipe.ts`, a private `termList` schema: `z.string().max(MAX_FILTER_TERMS * (MAX_TERM_LENGTH + 1))` → transform (split on `,`, trim, drop empties, keep the first of case-insensitive duplicates) → pipe `z.array(z.string().max(MAX_TERM_LENGTH)).max(MAX_FILTER_TERMS)`, `.optional()` defaulting to `[]`; `boolString = z.enum(['true','false']).transform((v) => v === 'true')`. Delete `toFilters`/`splitList` in the service; `list` hands the parsed query to `recipeStore.query(query, query.collectionId)`.
- [ ] **Step 4:** `npm run build --workspace=@cocktail/shared && npm run test --workspace=server` — Expected: PASS, existing filter tests unchanged.
- [ ] **Step 5:** Commit `feat(shared): cap filter terms, search and collection id in the query contract`.

### Task 1.2: Write limits and the body limit

**Files:** Modify `packages/shared/src/schemas/recipe.ts:10-54`, `packages/shared/src/schemas/collection.ts`, `packages/shared/src/schemas/ingredient.ts`, `server/src/routes/ingredients.ts:14-18`, `server/src/app.ts:26-27`. Test: `server/tests/recipes.test.ts`, `server/tests/collections.test.ts`, `server/tests/ingredients.test.ts`

**Interfaces:** Produces `ingredientNameParamSchema = z.string().min(1).max(INGREDIENT_NAME_MAX)` used by the ingredients route on the decoded `:name`.

- [ ] **Step 1: Failing tests**, one per limit at edge and edge+1, e.g.:

```ts
it('post_nameOf120Chars_created', …)            // 201
it('post_nameOf121Chars_returns400', …)
it('post_41Ingredients_returns400', …)
it('post_instructionsOf5001Chars_returns400', …)
it('post_21Tags_returns400', …)
it('post_bodyOver64KB_returns413', async () => {   // instructions-sized padding in an extra field
  const res = await request(app).post('/api/recipes').send({ name: 'x', ingredients: [{ name: 'gin' }], pad: 'a'.repeat(70_000) });
  expect(res.status).toBe(413);
});
it('post_urlencodedBody_returns400', …)          // body arrives empty → validation 400
it('collections_post_nameOf61Chars_returns400', …)
it('ingredients_patch_nameOf61Chars_returns400', …)
```

- [ ] **Step 2:** Run server tests — Expected: new cases FAIL.
- [ ] **Step 3:** Add `.max(...)` constants to the create and update schemas (same caps on both), the collection name, and the param schema; `express.json({ limit: '64kb' })`; delete the `urlencoded` line. Confirm `errorHandler` maps the `413` `http-errors` thrown by the JSON parser (it does through `isHttpError`).
- [ ] **Step 4:** Run server tests — Expected: PASS.
- [ ] **Step 5:** Commit `feat(server): cap write payloads and the request body`.

### Task 1.3: Quiet 4xx logging

**Files:** Modify `server/src/middleware/errorHandler.ts:25-30`. Test: `server/tests/errorHandler.test.ts`

- [ ] **Step 1: Failing test** `errorHandler_validationError_logsOneWarnLineWithoutStack`: spy on `console.error`, GET `/api/recipes?excludeIngredients=${terms(21)}`, expect exactly one call whose parsed JSON has `level: 'warn'`, `context: { method: 'GET', path: '/api/recipes', status: 400, message: 'Validation failed' }` and no `stack` key.
- [ ] **Step 2:** Run — FAIL (4xx is not logged today).
- [ ] **Step 3:** In the `known` branch: status < 500 → `logger.warn('Request rejected', { method, path, status, message })`.
- [ ] **Step 4:** Run — PASS. Existing 5xx test still asserts the stack.
- [ ] **Step 5:** Commit `feat(server): log rejected requests as one warn line`.

### Task 1.4: Client respects the limits

**Files:**

- Create: `client/src/features/Recipes/utils/filterLimits.ts`
- Modify: `client/src/features/Recipes/hooks/useFilterParams.ts`, `client/src/features/Recipes/components/IngredientSelector.tsx`, `client/src/features/Recipes/components/RecipeFilters.tsx`
- Test: `client/tests/filterLimits.test.ts` (new), `client/tests/useFilterParams.test.tsx`, `client/tests/IngredientSelector.test.tsx`

**Interfaces:**

- Produces: `clampFilters(filters: RecipeFilters): RecipeFilters` — keeps the first `MAX_FILTER_TERMS` of each list, drops terms longer than `MAX_TERM_LENGTH`, truncates `search` to `MAX_SEARCH_LENGTH`, drops a non-digit `collectionId`. `useFilterParams` returns clamped filters.
- Produces: `IngredientSelector` prop `max?: number`; at `selected.length >= max` the combobox is `disabled` and a hint `Up to {max} ingredients` is shown (`aria-describedby` on the input). `RecipeFilters` passes `max={MAX_FILTER_TERMS}` to both selectors.

- [ ] **Step 1: Failing tests**:

```ts
it('clampFilters_25Ingredients_keepsFirst20', …)
it('clampFilters_overlongTerm_dropped', …)
it('clampFilters_nonDigitCollectionId_dropped', …)
it('useFilterParams_urlWith25Ingredients_returns20', …)                 // MemoryRouter route with 25 terms
it('IngredientSelector_atMax_disablesInputAndShowsHint', …)             // getByText('Up to 20 ingredients')
```

- [ ] **Step 2:** `npm run test --workspace=client` — FAIL.
- [ ] **Step 3:** Implement; import constants from `@cocktail/shared/limits` (value import — check `client/dist` does not contain zod after build: `grep -c "ZodError" client/dist/assets/*.js` → 0).
- [ ] **Step 4:** Run client tests — PASS.
- [ ] **Step 5:** Commit `feat(client): keep filters within the server limits`.

### Task 1.5: Load probe and the read-path budget

**Files:** Create `scripts/load-probe.mjs`. Modify `knip.json` (root workspace entry `scripts/*.mjs`), `package.json` (script `"probe": "node scripts/load-probe.mjs"`), `AGENT.md` (commands list).

**Interfaces:** Produces `npm run probe -- [--recipes 1000]`: builds nothing itself (requires `npm run build` first). It sets `DATA_DIR` to a temp directory, seeds N recipes of 4–8 ingredients **in-process** by importing `server/dist/data/recipeStore.js` (so seeding never meets authentication or rate limits in later branches), closes that database handle, then starts `server/dist/index.js` on port 3111 against the same directory, prints one line per budget row and exits 1 when a row misses its budget.

Rows it measures (each the median of 20 runs unless stated):

- `worst legal filter` — 20 include + 20 exclude distinct terms, `onlySelectedIngredients=true`, `sortBy=ingredientCount`, `limit=48` (until Branch 2 lands, no `limit`) → ≤ 30 ms
- `typical filter` — `ingredients=rum,lime&excludeIngredients=mint&sortBy=rating` → ≤ 5 ms
- `health p95 during flood` — 10 concurrent clients repeating the worst filter for 3 s while `/api/health` is sampled every 50 ms → p95 ≤ 50 ms (until Branch 5 adds the limiter, report it without failing)

- [ ] **Step 1:** Write the script (adapt the probe used for the spec's starting point).
- [ ] **Step 2:** `npm run build && npm run probe` — record the three numbers.
- [ ] **Step 3:** If `worst legal filter` > 30 ms: add an LRU of prepared statements keyed by SQL text (max 256 entries) in `server/src/data/statementCache.ts` (`cachedPrepare(sql: string): Statement`), used by `recipeStore.query`, with a unit test `cachedPrepare_sameSql_returnsSameStatement` and an eviction test; re-run the probe. If ≤ 30 ms: skip this step and say so in the PR.
- [ ] **Step 4:** `npm run verify` — PASS (knip sees the script as an entry).
- [ ] **Step 5:** Commit `chore: add the read-path load probe`. Push the branch, run the whole-branch review, PR into `develop` with the probe output in the description.

---

## Branch 2 — `feat/paginated-list`

### Task 2.1: Paginated recipes endpoint

**Files:** Modify `packages/shared/src/schemas/recipe.ts` (add `limit`, `offset`, `RecipePage`), `server/src/data/recipeQuery.ts`, `server/src/data/recipeStore.ts:186-194`, `server/src/services/recipeService.ts`, `server/src/routes/recipes.ts:14-16`. Test: `server/tests/recipes.test.ts`, `server/tests/recipeQuery.test.ts`, `server/tests/regressions.test.ts`

**Interfaces:**

- Produces (shared): `RecipeQuery` gains `limit: number; offset: number`; `interface RecipePage { items: Recipe[]; total: number; nextOffset: number | null }`.
- Produces: `compileRecipeQuery(filters: RecipeFilters, collectionId: string | undefined, page: { limit: number; offset: number }): { selectSql: string; countSql: string; params: (string | number)[] }` — `selectSql` ends `ORDER BY … , r.id ASC LIMIT ? OFFSET ?` and expects `[...params, limit, offset]`; `countSql` is `SELECT COUNT(*) AS total FROM recipes r [WHERE …]` with `params`.
- Produces: `recipeStore.query(filters, collectionId, page): { items: Recipe[]; total: number }`; `recipeService.list(query): RecipePage` computes `nextOffset = offset + items.length < total ? offset + items.length : null`.

- [ ] **Step 1: Failing tests** (existing list tests switch from `res.body` to `res.body.items`):

```ts
it('list_default_returns24ItemsWithTotalAndNextOffset', …)   // seed 30 via recipeStore.add → items 24, total 38, nextOffset 24
it('list_lastPage_nextOffsetNull', …)                         // offset=24 → items 14, nextOffset null
it('list_offsetPastEnd_emptyItems', …)                        // offset=1000 → { items: [], total: 38, nextOffset: null }
it('list_limit49_returns400', …)
it('list_equalRatings_pagesDoNotOverlap', …)                  // sortBy=rating, limit=5, walk all pages, ids unique, count === total
it('list_collectionFilter_totalCountsOnlyMembers', …)
it('list_33000Recipes_firstPageOk', …)                        // bulk insert in one db.transaction, then GET → 200, 24 items (regressions.test.ts)
it('list_firstPageOf24_bodyUnder15000Bytes', …)               // seeded-size recipes (budget row "Network per action")
it('list_ifNoneMatch_returns304', …)                          // second GET with the ETag → 304, empty body
```

- [ ] **Step 2:** `npm run test --workspace=server` — FAIL.
- [ ] **Step 3:** Implement per Interfaces; run `count` and `select` against the same filtered `WHERE`.
- [ ] **Step 4:** Run server tests — PASS.
- [ ] **Step 5:** Commit `feat(server): paginate the recipe list`.

### Task 2.2: Infinite scroll in the client

**Files:**

- Create: `client/src/features/Recipes/hooks/useLoadMoreOnVisible.ts`, `client/src/features/Recipes/components/LoadMore.tsx`, `client/src/features/Recipes/utils/pages.ts`
- Modify: `client/src/features/Recipes/services/api.ts` (`list`), `client/src/features/Recipes/hooks/useRecipeQueries.ts:27-37`, `client/src/features/Recipes/RecipesPage.tsx:70-71,124-164`, `client/src/features/Recipes/components/RecipeSortBar.tsx`, `client/src/features/Recipes/components/RecipeCard.tsx`
- Test: `client/tests/pages.test.ts`, `client/tests/LoadMore.test.tsx`, `client/tests/useLoadMoreOnVisible.test.ts`, `client/tests/RecipesPage.integration.test.tsx`, `client/tests/api.test.ts`, `client/tests/RecipeCard.test.tsx`

**Interfaces:**

- Consumes: `RecipePage` (Task 2.1).
- Produces: `recipesApi.list(filters: RecipeFilters, offset: number, signal?: AbortSignal): Promise<RecipePage>` (sends `limit=24&offset=…`).
- Produces: `useRecipePages(filters: RecipeFilters)` = `useInfiniteQuery` with key `queryKeys.recipes(filters)`, `initialPageParam: 0`, `getNextPageParam: (last) => last.nextOffset ?? undefined`. Replaces `useRecipesQuery`.
- Produces: `flattenPages(pages: RecipePage[]): { recipes: Recipe[]; total: number }` — concatenates, keeps the first occurrence of each id, `total` from the last page.
- Produces: `useLoadMoreOnVisible(target: RefObject<Element | null>, enabled: boolean, onVisible: () => void): void` — one `IntersectionObserver` with `rootMargin: '600px'`, disconnected on unmount and when `enabled` is false.
- Produces: `LoadMore` props `{ hasMore: boolean; isLoading: boolean; isError: boolean; onLoadMore: () => void }` — renders the sentinel `div` and a button: `Show more` / `Loading…` (disabled) / `Try again`; renders nothing when `!hasMore`. Auto-load is enabled only when `hasMore && !isLoading && !isError`.
- Produces: `RecipeSortBar` props `shownCount: number; totalCount: number`; `.result-count` text `Showing {shown} of {total} recipes` (`recipe` when total is 1), inside `aria-live="polite"`.
- Produces: `RecipeCard` wrapped in `memo`; its callbacks become id-based and stable: `onRate(id, rating)`, `onEdit(recipe: Recipe)`, `onDelete(id: string)`, `onAddToCollection`, `onRemoveFromCollection`, `onCreateCollection` — `RecipesPage` creates each once with `useCallback`.

- [ ] **Step 1: Failing tests**:

```ts
it('flattenPages_overlappingPages_keepsEachIdOnce', …)
it('LoadMore_error_showsTryAgain', …) / it('LoadMore_noMore_rendersNothing', …) / it('LoadMore_loading_buttonDisabled', …)
it('useLoadMoreOnVisible_sentinelIntersects_callsOnVisibleOnce', …)   // stub IntersectionObserver, fire entry
it('useLoadMoreOnVisible_disabled_doesNotObserve', …)
it('RecipesPage_scrollToEnd_requestsOffset24', …)                     // fetch mock returns page 1 with nextOffset 24
it('RecipesPage_filterChangeWhilePage2Loading_showsOnlyNewFilterResults', …)   // Review Focus
it('RecipesPage_deleteWhileOnPage3_noDuplicateCards', …)                       // Review Focus
it('RecipesPage_appendPage_existingCardsDoNotRerender', …)   // vi.mock StarRating with a render counter keyed by recipeName; counts for page-1 cards unchanged after page 2
it('RecipesPage_resultCount_showingXofY', …)
it('api_list_sendsLimitAndOffset', …)
```

- [ ] **Step 2:** `npm run test --workspace=client` — FAIL.
- [ ] **Step 3:** Implement per Interfaces. Mutations still invalidate `queryKeys.allRecipes` (refetches every loaded page).
- [ ] **Step 4:** Run client tests — PASS. `npm run build` and `gzip -9c client/dist/assets/*.js | wc -c` ≤ 106 KB (108,544 bytes); record the number.
- [ ] **Step 5:** Commit `feat(client): load recipes page by page as you scroll`.

### Task 2.3: End-to-end for the list

**Files:** Modify `e2e/create-recipe.spec.ts` (count reads `Showing … of N`), create `e2e/infinite-scroll.spec.ts`, `e2e/idle.spec.ts`.

- [ ] **Step 1:** `infinite-scroll.spec.ts` `scrolling to the end shows every recipe once`: in `beforeAll`, POST 41 cocktail recipes through `request` (three pages together with the seeded cocktails; 41 keeps the whole e2e run under the 60-writes-per-minute limit added in Branch 5), open `/cocktails?sortBy=name`, scroll the last card into view until the "Show more" button is gone; expect the number of unique `h3` names to equal the total in `.result-count`. `idle.spec.ts` `an open list makes no requests while idle`: after load, count `page.on('request')` to `/api/` for 5 s → 0.
- [ ] **Step 2:** `npm run e2e` — new specs FAIL before Task 2.2 is merged into the branch, PASS after.
- [ ] **Step 3:** Commit `test(e2e): cover infinite scroll and an idle list`. Whole-branch review, push, PR with bundle size and probe output.

---

## Branch 3 — `feat/admin-login`

### Task 3.1: Password hashing and the hash command

**Files:** Create `server/src/lib/password.ts`, `server/src/scripts/hashPassword.ts`. Modify `server/package.json` (script `"hash-password": "tsx src/scripts/hashPassword.ts"`), `server/vitest.config.ts` (coverage exclude `src/scripts/**`), `knip.json` (server entry `src/scripts/*.ts`). Test: `server/tests/password.test.ts`

**Interfaces:**

- Produces: `hashPassword(password: string): Promise<string>`; `verifyPassword(password: string, encoded: string): Promise<boolean>` — never throws on a malformed `encoded` (returns false); `maxmem: 64 * 1024 * 1024`; compares with `timingSafeEqual`.
- Produces: `checkNewPassword(first: string, second: string): string | null` (in `password.ts`) → `'Use at least 12 characters'` / `'The passwords do not match'` / `null`. The CLI prompts twice without echo (readline with muted output), calls it, prints `ADMIN_PASSWORD_HASH=<hash>`.

- [ ] **Step 1: Failing tests**: `hashPassword_thenVerify_roundTrips`, `verifyPassword_wrongPassword_false`, `verifyPassword_malformedHash_falseNotThrow`, `hashPassword_format_scryptN32768r8p1`, `verifyPassword_lowCostHash_readsParamsFromString` (a hand-made N=1024 hash verifies), `checkNewPassword_elevenChars_rejected`, `checkNewPassword_mismatch_rejected`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS; `npm run hash-password --workspace=server` works by hand.
- [ ] **Step 5:** Generate the **test-only** hash with N=1024 for password `test-admin-password` (a one-off `node -e` using `scrypt` with `{ N: 1024 }`), and keep it as `TEST_ADMIN_PASSWORD_HASH` in `server/tests/helpers/admin.ts` (Task 3.4). Commit `feat(server): scrypt password hashing and the hash-password command`.

### Task 3.2: Environment contract

**Files:** Modify `server/src/config/env.ts`, `server/vitest.config.ts` (`env`: `ADMIN_USERNAME: 'admin'`, `ADMIN_PASSWORD_HASH: <test hash>`), `playwright.config.ts` (`webServer.env` same test values, with a comment "test-only credentials"), `.github/workflows/ci.yml` (docker smoke `docker run -e ADMIN_USERNAME=ci -e ADMIN_PASSWORD_HASH=<test hash> …`), `docker-compose.yml` (`ADMIN_USERNAME: ${ADMIN_USERNAME:?set ADMIN_USERNAME in .env}`, same for the hash), `server/tests/production.test.ts` (stub both), `scripts/load-probe.mjs` (passes the same test-only username and hash literal in the server's child-process env). Test: `server/tests/env.test.ts`

**Interfaces:** Produces `env.ADMIN_USERNAME?: string` (1–64), `env.ADMIN_PASSWORD_HASH?: string` (must match `/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/`), `env.SESSION_TTL_DAYS: number` (1–365, default 30), `env.TRUST_PROXY_HOPS: number` (0–5, default 0). A `superRefine` makes both admin variables required when `NODE_ENV === 'production'`.

- [ ] **Step 1: Failing tests**: `env_productionWithoutAdmin_failsNamingBothVariables`, `env_malformedHash_fails`, `env_developmentWithoutAdmin_ok`, `env_sessionTtlDefault_30`, `env_trustProxyHopsDefault_0`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement and update the configs listed. **Step 4:** `npm run test --workspace=server` — PASS (production test boots with stubs).
- [ ] **Step 5:** Commit `feat(server): admin credentials and session settings in the environment contract`.

### Task 3.3: Sessions table and store

**Files:** Modify `server/src/data/migrations/index.ts` (append `m005_sessions`, SQL exactly as in the spec). Create `server/src/data/sessionStore.ts`. Test: `server/tests/sessionStore.test.ts`, `server/tests/migrator.test.ts`

**Interfaces:** Produces `sessionStore.create(tokenHash: string, createdAt: number, expiresAt: number): void`, `isValid(tokenHash: string, now: number): boolean`, `remove(tokenHash: string): void`, `purgeExpired(now: number): number`, `reset(): void` (test helper, mirrors `recipeStore.reset`).

- [ ] **Step 1: Failing tests**: `isValid_beforeExpiry_true`, `isValid_atExpiry_false`, `remove_thenIsValid_false`, `purgeExpired_removesOnlyExpired_returnsCount`, `migrate_freshDb_hasSessionsTableAndIndex`.
- [ ] **Step 2–4:** FAIL → implement (prepared statements hoisted, as in `recipeStore`) → PASS.
- [ ] **Step 5:** Commit `feat(server): sessions table`.

### Task 3.4: Login, logout, session middleware

**Files:**

- Create: `server/src/lib/cookies.ts`, `server/src/services/authService.ts`, `server/src/middleware/session.ts`, `server/src/routes/auth.ts`, `server/src/types/express.d.ts`, `packages/shared/src/schemas/auth.ts`, `server/tests/helpers/admin.ts`
- Modify: `server/src/lib/errors.ts`, `server/src/routes/index.ts`, `server/src/app.ts`, `packages/shared/src/index.ts`
- Test: `server/tests/auth.test.ts`, `server/tests/cookies.test.ts`

**Interfaces:**

- Produces (shared): `loginSchema = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(256) })`; `interface SessionInfo { authenticated: boolean; username?: string }`.
- Produces: `UnauthorizedError` (401), `ForbiddenError` (403), `ServiceUnavailableError` (503) extending `AppError`, message passed in.
- Produces: `readCookie(header: string | undefined, name: string): string | undefined`; `sessionCookieName(nodeEnv: Env['NODE_ENV']): string`; `sessionCookieOptions(nodeEnv, maxAgeMs: number): CookieOptions` (`httpOnly`, `sameSite: 'strict'`, `path: '/'`, `secure` only in production, `maxAge`).
- Produces: `authService.login(username: string, password: string, now?: number): Promise<{ token: string; maxAgeMs: number }>` — 503 when unconfigured, always runs one `verifyPassword` (against a module-level dummy hash when the username differs), `UnauthorizedError('Wrong username or password')` on mismatch, `purgeExpired(now)` then `create(sha256(token), now, now + ttl)` on success. `authService.logout(token: string | undefined): void`. `authService.sessionFor(token: string | undefined, now?: number): { username: string } | undefined`.
- Produces: `session` middleware setting `req.admin` (augmentation of `express-serve-static-core` `Request` with `admin?: { username: string }`), mounted on the `/api` router before every sub-router.
- Produces: `authRouter` — `POST /login` (204 + cookie), `POST /logout` (204 + clear), `GET /me` (`SessionInfo`, `Cache-Control: no-store`).
- Produces (test helper): `TEST_ADMIN = { username: 'admin', password: 'test-admin-password' }`, `TEST_ADMIN_PASSWORD_HASH`, `adminAgent(app: Express): Promise<TestAgent>` — logs in through `request.agent(app)` with `Origin: http://localhost:5173` and returns the agent (cookie kept).

- [ ] **Step 1: Failing tests** (`auth.test.ts`):

```ts
it('login_correctCredentials_204AndHttpOnlyStrictCookie', …)   // Set-Cookie has HttpOnly, SameSite=Strict, Path=/, no Secure in test
it('login_wrongPassword_401WithGenericMessage', …)            // 'Wrong username or password'
it('login_wrongUsername_401SameMessage', …)
it('login_unconfigured_503', …)                                // vi.stubEnv both empty + resetModules
it('login_passwordOf257Chars_400', …)
it('me_withoutCookie_unauthenticated', …) / it('me_afterLogin_authenticatedWithUsername', …) / it('me_noStoreHeader', …)
it('logout_afterLogin_meUnauthenticated', …)
it('session_expired_meUnauthenticated', …)                     // login with now = Date.now() - ttl - 1 via authService, then GET /me
it('login_purgesExpiredSessions', …)
it('cookie_production_hostPrefixedAndSecure', …)               // sessionCookieName/Options('production')
```

`cookies.test.ts`: `readCookie_multipleCookies_findsByName`, `readCookie_missingHeader_undefined`, `readCookie_encodedValue_decoded`.

- [ ] **Step 2–4:** FAIL → implement → PASS. Writes are **not** guarded yet; every existing test still passes unchanged.
- [ ] **Step 5:** Commit `feat(server): admin login with server-side sessions`.

### Task 3.5: Login in the client

**Files:**

- Create: `client/src/lib/http.ts` (move `request`, `jsonInit`, `ApiError` from `features/Recipes/services/api.ts`), `client/src/features/Auth/services/authApi.ts`, `client/src/features/Auth/hooks/useSession.ts`, `client/src/features/Auth/LoginPage.tsx`, `client/src/features/Auth/loginForm.ts`, `client/src/features/Auth/components/AuthHeaderButton.tsx`
- Modify: `client/src/features/Recipes/services/api.ts` (imports from `lib/http`), `client/src/routes.tsx` (lazy `/login` route), `client/src/App.tsx` (header button)
- Test: `client/tests/LoginPage.test.tsx`, `client/tests/loginForm.test.ts`, `client/tests/useSession.test.tsx`, `client/tests/AuthHeaderButton.test.tsx`

**Interfaces:**

- Produces: `authApi.me(): Promise<SessionInfo>`, `authApi.login(username: string, password: string): Promise<void>`, `authApi.logout(): Promise<void>`.
- Produces: `queryKeys.session = ['session'] as const` (in `useSession.ts`); `useSession(): { isAdmin: boolean; username: string | undefined; isPending: boolean }`; `useLogin()` / `useLogout()` mutations that invalidate `['session']` and `queryKeys.allRecipes`.
- Produces: `safeReturnTo(value: string | null): string` in `loginForm.ts` — returns the value only when it starts with `/` and not `//`, else `/cocktails`; `loginErrorMessage(error: unknown): string` maps 401 → `'Wrong username or password'`, 429 → server message, 503 → `'Admin login is not configured'`, other → `'Could not log in. Try again.'`.
- Produces: `LoginPage` (default-exported only if `React.lazy` requires it; otherwise `lazy(() => import(...).then((m) => ({ default: m.LoginPage })))`) — labelled `Username` and `Password` inputs, `Log in` button, error in `role="alert"`, navigates to `safeReturnTo(searchParams.get('returnTo'))` on success.
- Produces: `AuthHeaderButton` — `Log in` link to `/login?returnTo=<current>` when logged out; `Log out` button when logged in.

- [ ] **Step 1: Failing tests**: `safeReturnTo_externalUrl_fallsBack`, `safeReturnTo_protocolRelative_fallsBack`, `loginErrorMessage_429_usesServerMessage`, `LoginPage_success_navigatesToReturnTo`, `LoginPage_401_showsAlert`, `useSession_meAuthenticated_isAdminTrue`, `AuthHeaderButton_loggedOut_showsLoginLinkWithReturnTo`, `AuthHeaderButton_logout_invalidatesSession`.
- [ ] **Step 2–4:** FAIL → implement → PASS; build and record JS gzip size (≤ 106 KB, login chunk separate).
- [ ] **Step 5:** Commit `feat(client): login page and session state`. Whole-branch review, PR.

---

## Branch 4 — `feat/guard-writes`

### Task 4.1: Guard the 9 write routes

**Files:** Create `server/src/middleware/sameOrigin.ts`, `server/src/middleware/requireAdmin.ts`. Modify `server/src/routes/index.ts`, `recipes.ts`, `collections.ts`, `ingredients.ts`, every existing server test that writes (use `adminAgent`). Test: `server/tests/writeGuards.test.ts`

**Interfaces:**

- Consumes: `req.admin`, `adminAgent`, `ForbiddenError`, `UnauthorizedError`.
- Produces: `sameOrigin(allowedOrigin: string): RequestHandler` — for methods other than GET/HEAD/OPTIONS, `ForbiddenError('Cross-site request refused')` unless `req.get('origin') === allowedOrigin`; mounted on the `/api` router (covers login and logout). `requireAdmin: RequestHandler` — `UnauthorizedError('Log in to make changes')` without `req.admin`; added as the first handler of each of the 9 routes listed in the spec.

- [ ] **Step 1: Failing tests** — table-driven over the 9 routes:

```ts
const WRITES = [
  ['post', '/api/recipes'], ['patch', '/api/recipes/1'], ['patch', '/api/recipes/1/rating'], ['delete', '/api/recipes/1'],
  ['post', '/api/collections'], ['post', '/api/collections/1/recipes/1'], ['delete', '/api/collections/1/recipes/1'],
  ['delete', '/api/collections/1'], ['patch', '/api/ingredients/gin'],
] as const;
it.each(WRITES)('%s %s_noSession_401', …)
it.each(WRITES)('%s %s_foreignOrigin_403', …)          // Origin: https://evil.example, with a session
it.each(WRITES)('%s %s_missingOrigin_403', …)
it.each(WRITES)('%s %s_adminSession_notGuarded', …)    // status is neither 401 nor 403
it('login_foreignOrigin_403', …)
it('getRecipes_noSession_200', …)                      // reads stay open
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement; convert existing write tests to `adminAgent(app)` with the `Origin` header. **Step 4:** `npm run test:coverage --workspace=server` — PASS, ≥ 80 %.
- [ ] **Step 5:** Commit `feat(server): only the logged-in admin can change data`.

### Task 4.2: Admin-only controls in the client

**Files:**

- Create: `client/src/features/Auth/components/SessionExpiredBanner.tsx`, `client/src/features/Auth/hooks/useUnauthorizedNotice.ts`
- Modify: `client/src/features/Recipes/RecipesPage.tsx`, `components/RecipeCard.tsx`, `components/StarRating.tsx`, `components/RecipeFilters.tsx`, `client/src/App.tsx`, `client/src/lib/http.ts` (send `credentials: 'same-origin'` explicitly)
- Test: `client/tests/RecipeCard.test.tsx`, `client/tests/StarRating.test.tsx` (new), `client/tests/RecipesPage.integration.test.tsx`, `client/tests/SessionExpiredBanner.test.tsx`

**Interfaces:**

- Consumes: `useSession()` (Task 3.5).
- Produces: `RecipeCard` prop `canEdit: boolean` (hides Edit, Delete, `CollectionPicker`; passes `readOnly={!canEdit}` to `StarRating`). `StarRating` prop `readOnly?: boolean` — renders the stars as non-interactive `span`s with the group's `aria-label` unchanged. `RecipeFilters` prop `canEdit: boolean` hides "Manage ingredients". `RecipesPage` hides `+ New Recipe` and never opens the classify dialog when `!isAdmin`.
- Produces: `useUnauthorizedNotice(): { expired: boolean; dismiss: () => void }` — subscribes to the mutation cache; on a mutation error that is an `ApiError` with status 401, invalidates `['session']` and sets `expired`. `SessionExpiredBanner` renders (when `expired`) `Your session has expired.` + link `Log in again` to `/login?returnTo=<current>` + dismiss button; mounted once in `App`. No automatic navigation (Review Focus).

- [ ] **Step 1: Failing tests**: `RecipeCard_canEditFalse_noEditDeleteOrCollections`, `StarRating_readOnly_noButtons`, `RecipesPage_loggedOut_noNewRecipeButton`, `RecipesPage_loggedIn_showsNewRecipeButton`, `RecipesPage_mutation401_showsBannerAndKeepsDialogOpen` (open edit dialog as admin, save → 401 → banner visible, dialog still in the document), `SessionExpiredBanner_dismiss_hides`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(client): show editing controls only to the admin`.

### Task 4.3: End-to-end with login

**Files:** Create `e2e/helpers/login.ts`, `e2e/auth.spec.ts`. Modify `e2e/create-recipe.spec.ts`, `e2e/rating.spec.ts`, `e2e/infinite-scroll.spec.ts` (seed through a logged-in `request` context with `Origin`).

**Interfaces:** Produces `loginAsAdmin(page: Page): Promise<void>` — fills `/login` with the test credentials and waits for `Log out`.

- [ ] **Step 1:** `auth.spec.ts` `the admin logs in, creates a recipe, logs out and can no longer edit`: assert `+ New Recipe` absent before login, present after, created card visible, after `Log out` no `Edit` buttons and stars are not buttons. Second test `a write without login is refused`: `request.post('/api/recipes', { headers: { Origin: baseURL }, data: {...} })` → 401.
- [ ] **Step 2:** `npm run e2e` — FAIL until helpers/specs are updated, then PASS (all specs).
- [ ] **Step 3:** `npm run build && npm run probe` — PASS (reads are unchanged by the guards; this confirms the budget still holds).
- [ ] **Step 4:** Commit `test(e2e): log in for every journey that writes`. Whole-branch review, PR.

---

## Branch 5 — `feat/rate-limits-and-caching`

### Task 5.1: Per-IP rate limiting

**Files:** Create `server/src/config/limits.ts`, `server/src/middleware/rateLimits.ts`. Modify `server/src/app.ts`, `server/src/routes/auth.ts`, `server/package.json` (`express-rate-limit` ^8.7.1). Test: `server/tests/rateLimits.test.ts`

**Interfaces:**

- Produces (`config/limits.ts`): `READ_LIMIT = { limit: 120, windowMs: 60_000 }`, `WRITE_LIMIT = { limit: 60, windowMs: 60_000 }`, `LOGIN_FAILURE_LIMIT = { limit: 5, windowMs: 15 * 60_000 }`.
- Produces: `createRateLimiters(): { read: RequestHandler; write: RequestHandler; loginFailures: RequestHandler }` — `standardHeaders: 'draft-8'`, `legacyHeaders: false`, a `handler` that sends the 429 body from Global Constraints with `retryAfterSeconds` from `req.rateLimit.resetTime`; `read` skips non-GET/HEAD and `/health`; `write` skips GET/HEAD and `/auth/login`; `loginFailures` uses `skipSuccessfulRequests: true`. Called inside `createApp()` so every app instance (and test) has its own memory store. `app.set('trust proxy', env.TRUST_PROXY_HOPS)`.

- [ ] **Step 1: Failing tests**:

```ts
it('reads_121stInAMinute_429WithRetryAfter', …)
it('reads_afterWindow_allowedAgain', …)          // vi.useFakeTimers({ toFake: ['Date'] }), advance 60 s
it('health_notLimited', …)                       // 130 GETs to /api/health → all 200
it('writes_61stInAMinute_429', …)                // as admin
it('login_sixthFailure_429', …) / it('login_successes_notCounted', …)
it('limits_perIp_twoClientsIndependent', …)      // TRUST_PROXY_HOPS=1 app, X-Forwarded-For differs
it('limits_spoofedLeftmostForwardedFor_stillLimited', …)   // Review Focus: rotate the left-most XFF value, keep the right-most → still 429 at 121
it('429Body_hasStatusMessageRetryAfterSeconds', …)
```

- [ ] **Step 2–4:** FAIL → `npm install express-rate-limit@^8.7.1 --workspace=server`, implement → PASS. Confirm no `console` output from the library's validation checks in the test log.
- [ ] **Step 5:** Commit `feat(server): rate-limit reads, writes and failed logins per IP`.

### Task 5.2: Cache headers and server timeouts

**Files:** Create `server/src/middleware/cacheHeaders.ts`, `server/src/lib/serverTimeouts.ts`. Modify `server/src/app.ts:39-50`, `server/src/index.ts`. Test: `server/tests/cacheHeaders.test.ts`, `server/tests/production.test.ts`, `server/tests/serverTimeouts.test.ts`

**Interfaces:**

- Produces: `apiCacheHeaders: RequestHandler` — GET/HEAD under `/api` gets `Cache-Control: no-cache` unless the route already set one (auth sets `no-store`). `staticCacheHeaders(res: Response, filePath: string): void` for `express.static`'s `setHeaders` — files under `assets/` get `public, max-age=31536000, immutable`, everything else `no-cache`; the SPA fallback sets `no-cache`.
- Produces: `applyServerTimeouts(server: Server): void` — `headersTimeout = 10_000`, `requestTimeout = 30_000`; `index.ts` calls it on the value returned by `app.listen`.

- [ ] **Step 1: Failing tests**: `apiGet_noCache`, `authMe_noStore`, `apiGet_repeatWithEtag_304`, `assetFile_immutableOneYear` (production test writes `client/dist/assets/app-abc123.js`), `indexHtml_noCache`, `spaFallback_noCache`, `applyServerTimeouts_setsBothValues`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(server): cache headers for API and static files, request timeouts`.

### Task 5.3: Client handling of 429

**Files:** Modify `client/src/lib/queryClient.ts`, `client/src/features/Recipes/RecipesPage.tsx` (error message), `client/src/features/Recipes/components/LoadMore.tsx` (no change in behaviour; test only). Test: `client/tests/queryClient.test.ts` (new), `client/tests/RecipesPage.integration.test.tsx`

**Interfaces:** Produces `shouldRetry(failureCount: number, error: unknown): boolean` (exported from `queryClient.ts`) — false for any `ApiError` with status 400–499, otherwise `failureCount < 1`; used as `queries.retry`.

- [ ] **Step 1: Failing tests**: `shouldRetry_429_false`, `shouldRetry_500_onceOnly`, `RecipesPage_429_showsServerMessageAndNoRetry` (fetch mock called exactly once, text `Too many requests — try again in a moment`), `RecipesPage_429OnNextPage_showsTryAgain`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** `npm run verify && npm run build && npm run probe` — all rows within budget now including `health p95 during flood ≤ 50 ms` (the probe fails on it from this branch on). Commit `feat(client): show rate-limit messages instead of retrying`. Whole-branch review, PR with probe output.

---

## Branch 6 — `feat/deploy-behind-caddy`

### Task 6.1: Production compose, env example and deployment guide

**Files:** Create `compose.prod.yaml`, `docs/deploy.md`. Modify `.env.example`, `README.md` (Docker section links `docs/deploy.md`), `CLAUDE.md` (status), `AGENTS.md` ("Not set up on purpose": authentication now exists for one admin).

**Interfaces:** `compose.prod.yaml` — service `cocktail`: `build: .`, `image: cocktail:latest`, `env_file: .env`, `environment: { NODE_ENV: production, PORT: '3000', DATA_DIR: /data, TRUST_PROXY_HOPS: '1' }`, `volumes: [cocktail-db:/data]`, `networks: [caddy]`, `restart: unless-stopped`, **no `ports`**; `networks.caddy: { external: true, name: '${CADDY_NETWORK:-caddy}' }`; `volumes.cocktail-db: {}`.

- [ ] **Step 1:** Validate: `docker compose -f compose.prod.yaml config` with a `.env` containing test values and `docker network create caddy` → prints the resolved config, no `ports`.
- [ ] **Step 2:** Smoke on this machine: `docker compose -f compose.prod.yaml up -d --build`; from a throwaway container on the same network, `curl -fsS http://cocktail:3000/api/health` → 200; `curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: <CLIENT_ORIGIN>' -H 'Content-Type: application/json' -d '{}' http://cocktail:3000/api/recipes` → 401; then `docker compose -f compose.prod.yaml down`.
- [ ] **Step 3:** Write `docs/deploy.md`: prerequisites; `npm run hash-password --workspace=server`; `.env` (every variable, `CLIENT_ORIGIN=https://<domain>`); the Caddy site block `<domain> {\n\tencode zstd gzip\n\treverse_proxy cocktail:3000\n}`; first start `docker compose -f compose.prod.yaml up -d --build`; update (`git pull && … up -d --build`); smoke checks (health 200, unauthenticated write 401, `curl --compressed -w '%{size_download}' https://<domain>/api/recipes` ≤ 5,000 bytes and `Content-Encoding` present); the botnet caveat; where the SQLite file lives (`cocktail-db` volume) and that backups are not part of this setup.
- [ ] **Step 4:** `npm run verify` (Prettier covers the new files) — PASS.
- [ ] **Step 5:** Commit `docs: deploy behind an existing Caddy`. Whole-branch review, PR. After the owner deploys, record the compressed page size from Step 3's command in the PR (budget row "Network per action").
