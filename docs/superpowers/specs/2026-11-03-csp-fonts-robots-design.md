# Strict CSP, no third-party font, robots.txt — design

Date: 2026-11-03 · Status: draft, awaiting review

## Purpose

Before the app is public, every browser request it triggers must go to its own origin,
and the browser must refuse anything else.

- `client/index.html:5-10` loads the Inter font from `fonts.googleapis.com` and
  `fonts.gstatic.com`. Every visitor's IP address and user agent go to Google on each
  page load, which is a GDPR problem for a public site with no consent banner.
- Nothing uses Inter. `--font-text` in `client/src/index.css` is a Charter/Georgia serif
  stack and `--font-measure` is a system monospace; no other rule names Inter.
- `server/src/app.ts:24` calls plain `helmet()`. Its default CSP allows `https:` and
  `'unsafe-inline'` for styles and `https:` and `data:` for fonts, which is why the Google
  stylesheet works at all. If a third-party include crept back in, the browser would load
  it silently.
- `/robots.txt` falls through to the SPA fallback and answers with `index.html` and a 200.

This is work package 2 of the go-public hardening audit of 2026-11-02 (handoff:
`tasks/handoff/CocktailRecipes.md` in agent-kit).

**Success means**

- The built page makes no request to any host other than its own.
- The CSP header allows only `'self'` for scripts, styles, fonts, connections and frames,
  and `data:` only for images.
- The production build loads and works under that CSP, proven by a browser run.
- `/robots.txt` returns `text/plain` with a 200 and keeps crawlers off `/api/`.

## Decisions (locked)

| Decision                                                                      | Rationale                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Delete the Inter links; do not self-host the font                             | Nothing renders in Inter. Self-hosting would add woff2 files, a licence notice and bytes for a font that is never used. The design already chose Charter.                                                                                                                |
| Keep `useDefaults: true` and override only `style-src`, `font-src`, `img-src` | The other defaults (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'self'`, `form-action 'self'`, `upgrade-insecure-requests`) are already right. A short override list is easier to review than a restated policy. |
| `img-src 'self' data:`                                                        | Two CSS rules in `index.css` use inline SVG `data:` chevrons for the select arrow.                                                                                                                                                                                       |
| No `'unsafe-inline'`                                                          | The client has no `<style>` tag and no `style=` prop. `document.body.style.overflow` (`useModal.ts`) goes through the CSSOM, which CSP allows. The browser run proves it; see the stop condition below.                                                                  |
| `robots.txt` allows the site and disallows `/api/`                            | The recipes are public and may be found. Crawlers should not hit the API, which is rate limited per IP. It is courtesy, not a security control.                                                                                                                          |
| `robots.txt` lives in `client/public/`                                        | Vite copies it to `client/dist/`, `express.static` serves it, and the dev server serves it too. No server code.                                                                                                                                                          |
| The CSP is asserted against the real built client                             | A header test alone cannot show that the page still works under it.                                                                                                                                                                                                      |

**Stop condition.** If the production build turns out to need `'unsafe-inline'` or another
host, the work stops and comes back to the owner. The policy is not loosened to make the
test pass.

## Starting point

- `server/src/app.ts:24`: `app.use(helmet())`.
- `server/tests/production.test.ts` starts the app with `NODE_ENV=production` against a
  built `client/dist/`; the new server assertions go there.
- `e2e/` Playwright specs run against the production build on :3100.
- `client/public/` does not exist yet.

## Behaviour

`Content-Security-Policy` on every response:

| Directive                   | Value                              | Source         |
| --------------------------- | ---------------------------------- | -------------- |
| `default-src`               | `'self'`                           | helmet default |
| `script-src`                | `'self'`                           | helmet default |
| `style-src`                 | `'self'`                           | override       |
| `font-src`                  | `'self'`                           | override       |
| `img-src`                   | `'self' data:`                     | override       |
| `connect-src`               | falls back to `default-src 'self'` | –              |
| `object-src`                | `'none'`                           | helmet default |
| `base-uri`                  | `'self'`                           | helmet default |
| `form-action`               | `'self'`                           | helmet default |
| `frame-ancestors`           | `'self'`                           | helmet default |
| `script-src-attr`           | `'none'`                           | helmet default |
| `upgrade-insecure-requests` | present                            | helmet default |

`GET /robots.txt`:

```
User-agent: *
Disallow: /api/
```

Served as `text/plain` with the static revalidate header (`no-cache`), like every
file outside `assets/`.

## Files

- `client/index.html`: remove the two `preconnect` links and the Inter stylesheet link.
- `client/public/robots.txt`: new, the text above.
- `server/src/app.ts`: `helmet({ contentSecurityPolicy: { useDefaults: true, directives: { styleSrc: ["'self'"], fontSrc: ["'self'"], imgSrc: ["'self'", 'data:'] } } })`.
- `server/tests/production.test.ts`: header and robots assertions.
- `e2e/csp.spec.ts`: new browser check.
- `CLAUDE.md` "Current status & next steps": one paragraph for WP2 (in the PR).

## Error cases

None at request time. A CSP violation shows in the browser console only. The two
failure modes are covered by the tests: a page that needs a source the policy refuses
(e2e fails), and a policy that drifts looser (the header test fails).

## Efficiency budget

| Row                                      | Before                          | After                                                                 | Check                                                                 |
| ---------------------------------------- | ------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Requests to other hosts on first load    | 3 (2 preconnects, 1 stylesheet) | 0                                                                     | `e2e/csp.spec.ts` fails on any request to a host other than the app's |
| Render-blocking third-party requests     | 1                               | 0                                                                     | same                                                                  |
| Requests while idle                      | 0                               | 0                                                                     | existing `e2e/idle.spec.ts`, unchanged                                |
| Added payload                            | –                               | `robots.txt` (~35 bytes), fetched by crawlers only                    | none needed                                                           |
| Response header size                     | helmet default CSP              | about the same: shorter values replace `https:` and `'unsafe-inline'` | none needed                                                           |
| Client bundle size, time to first render | –                               | unchanged, one fewer blocking stylesheet                              | none: no client code changes; `pnpm build` output unchanged           |

No list rendering, re-render or database row is touched.

## Testing

- `server/tests/production.test.ts`, written first and watched failing:
  - the CSP header parsed into directives equals the table above;
  - no directive value contains `https:`, `http:`, `*` or `'unsafe-inline'`;
  - `GET /robots.txt` is 200, `text/plain`, and contains `Disallow: /api/`;
  - `GET /no-such-page` still returns `index.html` (the fallback is intact).
- `e2e/csp.spec.ts`, written first: open `/cocktails` and one recipe on the production
  build; collect `console` messages containing "Content Security Policy" and
  `securitypolicyviolation` events, and every request URL. Fail on any violation and on
  any request whose host differs from the app's. Also check `/robots.txt` returns text.
- The spec also covers the list, the filter dropdown (the data-URI chevron) and the
  modal (the `body.style.overflow` path), so the three places that could trip the policy
  are exercised.
- `pnpm verify` and `pnpm e2e` green; `pnpm build` succeeds.
- Before the PR, `grep` shows no `googleapis` or `gstatic` left in the repository.

## Out of scope

Self-hosted fonts, `Permissions-Policy`, `report-uri` or `report-to`, a sitemap, changes
to `frame-ancestors`, response headers set by Caddy or Cloudflare (work package 6), and
the dependency upgrades from today's check.
