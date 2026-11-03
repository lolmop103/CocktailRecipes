# Strict CSP, no third-party font, robots.txt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The built app makes no request to another host, the browser enforces that with a `'self'`-only CSP, and `/robots.txt` is a real file.

**Architecture:** Delete the unused Inter links from `client/index.html`, replace `helmet()` with a helmet CSP that keeps the defaults and overrides three directives, and add `client/public/robots.txt` that Vite copies into `client/dist/`. A Playwright spec against the production build proves the page still works under the policy.

**Tech Stack:** Express 5, helmet 8, Vite 8, Vitest + supertest, Playwright (Chromium).

**Spec:** `docs/superpowers/specs/2026-11-03-csp-fonts-robots-design.md`

**Branch:** one branch, `feat/csp-fonts-robots`, cut from `develop`; PR into `develop`.

## Global Constraints

- CSP: `style-src 'self'`, `font-src 'self'`, `img-src 'self' data:`; every other directive stays at helmet's default. No `'unsafe-inline'`, no `https:`, no `http:`, no `*` anywhere.
- Stop condition: if the production build needs `'unsafe-inline'` or another host, stop and report to the owner; never loosen the policy to pass a test.
- `robots.txt` content is exactly `User-agent: *` newline `Disallow: /api/` newline.
- Tests first, watched failing for the right reason. Conventional Commits. No AI attribution in commits or the PR.
- Test names follow the existing style: `subject_condition_expected`.
- Definition of done: `pnpm verify` green, `pnpm build` succeeds, `pnpm e2e` green.

## Review Focus

- A `data:` image is the only `data:` the policy may allow: a test must show `font-src` and `script-src` have none (Task 1).
- The SPA fallback must not swallow `/robots.txt` any more, and an unknown path must still return `index.html` (Task 1).
- The admin "New Recipe" dialog (`body.style.overflow`) and the filter selects (data-URI chevron) are the places that could trip the policy; the browser spec must open both (Task 2).
- A request to another host must fail the e2e even when it is blocked and silent, so requests are collected, not only console messages (Task 2).
- No `googleapis` or `gstatic` left anywhere in the repository (Task 1).

---

### Task 1: CSP, robots.txt and Inter removal

**Files:**

- Modify: `client/index.html:5-10`
- Create: `client/public/robots.txt`
- Modify: `server/src/app.ts:24`
- Test: `server/tests/production.test.ts`

**Interfaces:**

- Produces: `/robots.txt` served by `express.static` from `client/dist`; the CSP header on every response. Task 2 relies on both.

- [ ] **Step 1: Write the failing tests** in the `production boot` describe of `server/tests/production.test.ts`. In `beforeAll`, also write `client/dist/robots.txt` with the exact content from Global Constraints (the test boots from a fake dist). Add a helper `parseCsp(header: string): Record<string, string[]>` (split on `;`, then whitespace) and four tests:
  - `csp_directives_matchPolicy`: `GET /` header `content-security-policy` parsed equals `default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `font-src 'self'`, `img-src 'self' data:`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'`, `script-src-attr 'none'`, plus an `upgrade-insecure-requests` key with `[]`. Assert with `toMatchObject` for the first ten and `toHaveProperty('upgrade-insecure-requests')`.
  - `csp_noValueLoosens`: every value of every directive, joined, matches none of `https:`, `http:`, `'unsafe-inline'`, `'unsafe-eval'` and has no `*` entry; and `data:` appears only under `img-src`.
  - `robotsTxt_served_asText`: `GET /robots.txt` is 200, `content-type` matches `/^text\/plain/`, body contains `Disallow: /api/`, and `cache-control` is `no-cache`.
  - `unknownPath_stillServesIndex`: `GET /no-such-page` returns `INDEX_HTML`.

- [ ] **Step 2: Run to see failure.** `pnpm --filter server exec vitest run tests/production.test.ts`. Expected: `csp_directives_matchPolicy` and `csp_noValueLoosens` FAIL (`style-src` is `'self' https: 'unsafe-inline'`, `font-src` has `https:`); the other two PASS already because the file is in the fake dist, which is fine: they guard the contract, and the real file is checked in Step 7.

- [ ] **Step 3: Implement the CSP** in `server/src/app.ts:24`: replace `app.use(helmet())` with `helmet({ contentSecurityPolicy: { useDefaults: true, directives: { styleSrc: ["'self'"], fontSrc: ["'self'"], imgSrc: ["'self'", 'data:'] } } })`. Keep the `// Security` comment; add one line saying why the three are overridden.

- [ ] **Step 4: Run to see pass.** Same command. Expected: all `production boot` tests PASS. Then `pnpm --filter server test` to confirm no other server test depended on the old header.

- [ ] **Step 5: Remove Inter and add robots.** Delete lines 5-10 of `client/index.html` (the two `preconnect` links and the stylesheet link). Create `client/public/robots.txt` with the exact content from Global Constraints.

- [ ] **Step 6: Build and inspect.** `pnpm build`. Expected: `client/dist/robots.txt` exists with the two lines; `client/dist/index.html` contains neither `googleapis` nor `gstatic`.

- [ ] **Step 7: Check the repository.** `git grep -n -i "googleapis\|gstatic"` returns nothing outside `docs/superpowers/` (the spec names them). If a hit appears in code, config or `README.md`, remove it.

- [ ] **Step 8: Commit.**

```bash
git add client/index.html client/public/robots.txt server/src/app.ts server/tests/production.test.ts
git commit -m "feat(server): strict CSP, drop the unused Google font, add robots.txt"
```

---

### Task 2: Browser proof and status note

**Files:**

- Create: `e2e/csp.spec.ts`
- Modify: `CLAUDE.md` ("Current status & next steps")

**Interfaces:**

- Consumes: Task 1's CSP and `/robots.txt`; `loginAsAdmin(page)` from `e2e/helpers/login.js`.

- [ ] **Step 1: Write the failing spec** `e2e/csp.spec.ts`. One test, `the app loads under the CSP and talks only to its own origin`:
  - Before navigating, register `page.on('request')` collecting every URL whose scheme is `http`/`https` into `requests`; `page.on('console')` collecting texts containing `Content Security Policy` into `violations`; and `page.addInitScript` that pushes `securitypolicyviolation` events onto `window.__cspViolations`.
  - Visit `/cocktails`; wait for the `Mojito` level-3 heading; open each `.filter-group select` once with `selectOption` on its first option value if there is one, or just `focus()` otherwise (renders the data-URI chevron); `loginAsAdmin(page)`, go to `/cocktails`, click `+ New Recipe`, expect the `Add new recipe` dialog visible, then close it with Escape.
  - `networkidle`, then expect: every `new URL(url).origin` in `requests` equals the origin of `baseURL`; `violations` equals `[]`; `window.__cspViolations` equals `[]`.
  - A second test `robots.txt is plain text that keeps crawlers off the API`: `page.request.get('/robots.txt')`, status 200, `content-type` starts with `text/plain`, body contains `Disallow: /api/`.

- [ ] **Step 2: Run it.** `pnpm exec playwright test e2e/csp.spec.ts`. Expected: PASS, because Task 1 is already in. To see the test can fail, temporarily re-add one Inter `<link>` to `client/index.html`, rebuild via the run, and confirm the first test FAILS on the foreign origin; then revert that edit (`git checkout client/index.html`) and confirm PASS again. If the spec fails with the Task 1 code, apply the Stop condition.

- [ ] **Step 3: Update `CLAUDE.md`.** In "Current status & next steps", add a paragraph after the 2026-11-03 fail-safes one: since 2026-11-03 the CSP allows only `'self'` (images also `data:`), the Inter font and its Google links are gone, and `client/public/robots.txt` disallows `/api/`; this is work package 2 of the go-public audit.

- [ ] **Step 4: Full gates.** `pnpm verify`, `pnpm build`, `pnpm e2e`. Expected: all green; coverage at or above 80% in `server` and `client`.

- [ ] **Step 5: Commit.**

```bash
git add e2e/csp.spec.ts CLAUDE.md
git commit -m "test(e2e): production build loads under the CSP and calls only its own origin"
```

---

## Self-review

- **Spec coverage:** Inter removal, CSP table, `robots.txt`, header test, no-loosening test, fallback intact, browser run over list, filter selects and modal, repository grep, status paragraph, stop condition: all in Tasks 1-2. The efficiency rows are checked by `e2e/csp.spec.ts` (foreign requests) and the unchanged `idle.spec.ts`.
- **Types and names:** `parseCsp` is defined and used only in Task 1; Task 2 uses only existing helpers.
- **Proportion:** the plan is shorter than the code it replaces would be to describe; steps give assertions and signatures, not bodies.
