# AGENT.md — Cocktail Project

Protocol: aop-optimised · Bootstrap: aop-scaffold
Stack: Node.js · Express 4 · React 18 · TypeScript 5 · Vite · Vitest

---

## Stack

| Layer      | Technology              | Version |
| ---------- | ----------------------- | ------- |
| Runtime    | Node.js                 | ≥22 LTS |
| Backend    | Express                 | ^4.18   |
| Frontend   | React                   | ^18     |
| Bundler    | Vite                    | ^5      |
| Language   | TypeScript              | ^5      |
| Testing    | Vitest                  | ^1      |
| Test UI    | React Testing Library   | ^15     |
| Linting    | ESLint                  | ^9      |
| Formatting | Prettier                | ^3      |
| Database   | SQLite (better-sqlite3) | ^12     |

---

## Build Commands

```bash
# Root (monorepo)
npm install                   # install all workspaces
npm run dev                   # start server + client (concurrent)
npm run build                 # build all workspaces
npm run test                  # run all tests
npm run lint                  # lint all workspaces
npm run typecheck             # typecheck all workspaces
npm run format                # prettier --write .
npm run format:check          # prettier --check . (CI gate)
npm run knip                  # unused files, exports and dependencies
npm run test:coverage         # tests + 80% coverage gate
npm run verify                # format + lint + typecheck + knip + coverage

# Server workspace
cd server
npm run dev                   # tsx watch mode
npm run build                 # tsc -p tsconfig.build.json -> dist/
npm run test                  # vitest
npm run lint                  # eslint .
npm run typecheck             # tsc --noEmit

# Client workspace
cd client
npm run dev                   # vite dev server
npm run build                 # vite build to dist/
npm run test                  # vitest
npm run lint                  # eslint .
npm run typecheck             # tsc --noEmit
```

---

## Conventions

- **Language**: TypeScript everywhere. `noImplicitAny`, `strict: true`, `noEmit` for type checks.
- **Imports**: absolute via `tsconfig` paths; no relative `../../` beyond 2 levels.
- **Contract**: domain types are defined once, in `@cocktail/shared`, as zod schemas with `z.infer`. Never redeclare a wire type in `server/` or `client/`.
- **Layering**: routes parse and delegate; services hold use cases and throw domain errors; stores own SQL. A route must never touch two stores directly.
- **Schema changes**: add a numbered migration. Never edit a released one, and never rely on `CREATE TABLE IF NOT EXISTS` to alter an existing table.
- **Server state**: TanStack Query, never hand-rolled fetch effects. Invalidate through `queryKeys`.
- **Filter/view state**: the URL, not `useState` — every view must be linkable.
- **Components**: arrow const with a named `interface Props` — `export const Name = ({ … }: Props) => …`. Never a `function` declaration, and never a `function` inside a component body. Class components only where React requires one (error boundaries).
- **One component per file**: a helper used by a single parent still gets its own file. A nested `const Helper = …` above the export cannot be tested or reused without exporting the parent's internals.
- **Logic out of components**: pure state transitions and validation live in a sibling `*Form.ts`; derivations live in `utils/`; cross-component behaviour lives in `hooks/`. Each gets a unit test. Event handlers that close over local state stay in the component — extracting those only threads dependencies through argument lists.
- **Tests**: Vitest + React Testing Library. `Method_Scenario_Expected` naming. AAA structure. No `.only` or `.skip` in committed code — enforced by `vitest/no-disabled-tests` and `vitest/no-focused-tests`, not by review. Every test must assert (`vitest/expect-expect`).
- **Commits**: Conventional Commits `#{N}.{s}.T:summary`.
- **Formatting**: Prettier + EditorConfig = law. No suppression directives.
- **Linting**: ESLint 0 warnings. `no-console` on in production code. No `any` without `// eslint-disable` + justification.
- **Coverage**: 80% is a gate, not a suggestion — CI runs `test:coverage`, so a drop below it fails the build.
- **Dead code**: `knip` gates CI. An unused export, file or dependency fails the build — delete it or use it, do not leave it lying around.
- **Async**: async/await everywhere. No `.then()` chains. No blocking sync calls in request handlers.
- **Error handling**: Express uses `next(err)` pattern. HTTP errors use `http-errors`. Validation failures go through `lib/validation.ts` so clients get `{ status, message, errors[] }` — never a raw Zod dump.
- **Env vars**: Declared in `server/src/config/env.ts` and validated at startup via `zod`. Read `env`, never `process.env`, outside that module.
- **Security**: Helmet on Express. CORS configured explicitly. No raw SQL — use parameterized queries if needed.
- **GDPR**: PII annotated with JSDoc `@personalData`. No PII in logs.
- **Logging**: `lib/logger.ts` only. `no-console` is enforced everywhere else.
- **Ids**: allocated through `data/ids.ts`. Never `MAX(id) + 1` — ids must not be reused after a delete.
- **Partial updates**: an absent key means "leave unchanged", an explicit `null` means "clear". Both the API schema and the client payload builders honour this.
- **Accessibility**: every interactive element keeps a visible `:focus-visible` ring; dropdowns support arrow keys, Enter and Escape; modals trap focus and restore it on close.

---

## Prohibited

- `any` type without documented justification
- `console.log` in production code (use logger)
- Hardcoded secrets, credentials, or connection strings
- `npm install --save` without updating lock file
- Merging to main without passing CI
- `TODO` comments in committed code
- Magic numbers / strings — use named constants

---

## Tooling

Project-specific skills live in `.github/skills/<name>/SKILL.md` and are
committed with the code:

- `react-components` — component declaration, file-per-component, and where
  logic belongs relative to a component body.

The wider AOP agent toolkit (protocol, agents, cross-project skills) lives
outside this repository and is not required to build, test or run the project.
Everything needed is in `npm run verify`.
