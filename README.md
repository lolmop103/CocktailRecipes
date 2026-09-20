# Cocktail

[![CI](https://github.com/lolmop103/CocktailRecipes/actions/workflows/ci.yml/badge.svg)](https://github.com/lolmop103/CocktailRecipes/actions/workflows/ci.yml)

A cocktail and mocktail recipe manager: browse what you can make, filter by the
bottles you actually own, rate what you have tried, and group recipes into
collections.

Full-stack TypeScript — Node.js/Express + SQLite on the back, React + Vite on the front,
with the API contract defined once in a shared package and consumed by both.

## Prerequisites

- Node.js ≥ 22 LTS
- npm ≥ 10

## Getting Started

```bash
# Install all workspace dependencies
npm install

# Start dev servers (Express API + Vite React, concurrent)
npm run dev
```

- API: http://localhost:3000
- Client: http://localhost:5173

The database is created and seeded with eight classics on first run.

## Features

- **Cocktail / mocktail tabs** — alcoholic ingredients are hidden from the picker on the mocktail tab
- **Ingredient filtering** — include (must have all), exclude ("without"), and "only these ingredients" for what you can make right now
- **Search, rating filter and sorting** by name, rating or ingredient count
- **Full CRUD** with an ingredient autocomplete, glass types and tags
- **Ingredient classification** — new ingredients are classified alcoholic / non-alcoholic, which is what drives mocktail filtering
- **Collections** — group recipes and filter the grid by collection
- **ml ⇄ oz toggle** — converts amounts on the fly, leaving "top up" and "10 leaves" alone

## Project Structure

```
cocktail/
├── packages/shared/         # The API contract: zod schemas + inferred types
│   └── src/schemas/         # Used by the server to validate, by the client to type
├── server/                  # Node.js / Express API
│   ├── src/
│   │   ├── app.ts           # Express app factory
│   │   ├── config/env.ts    # Zod-validated environment
│   │   ├── lib/             # logger, AppError hierarchy, validation
│   │   ├── routes/          # Thin HTTP adapters — parse, delegate, respond
│   │   ├── services/        # Use cases; throw domain errors, know no HTTP
│   │   └── data/            # connection, migrations, ids, stores
│   └── tests/
├── client/                  # React + Vite frontend
│   ├── src/
│   │   ├── routes.tsx       # React Router: /cocktails, /mocktails
│   │   ├── lib/             # TanStack Query client
│   │   └── features/Recipes # Page, components, query hooks, services
│   └── tests/
├── tasks/                   # AOP task tracking
├── kb/                      # AOP knowledge base
└── AGENT.md                 # Project conventions & build commands
```

## Scripts

| Command                 | Description                        |
| ----------------------- | ---------------------------------- |
| `npm run dev`           | Start all dev servers concurrently |
| `npm run build`         | Build all workspaces               |
| `npm run test`          | Run all tests                      |
| `npm run lint`          | Lint all workspaces                |
| `npm run typecheck`     | TypeScript check all workspaces    |
| `npm run format`        | Format with Prettier               |
| `npm run format:check`  | Verify formatting (CI gate)        |
| `npm run knip`          | Find unused files, exports, deps   |
| `npm run test:coverage` | Run tests and enforce 80% coverage |
| `npm run verify`        | Everything CI runs, in one command |

## Architecture notes

- **One contract, two consumers.** `packages/shared` holds the zod schemas. The
  server validates with them; the client imports the inferred types with
  `import type`, so zod never reaches the browser bundle.
- **Server layering.** Routes parse and delegate. Services hold the use cases and
  throw `NotFoundError`/`ValidationError`; only the error middleware knows HTTP.
- **Migrations.** Versioned files in `server/src/data/migrations/`, each applied
  once inside a transaction and recorded in `schema_migrations`.
- **Server state.** TanStack Query owns fetching, caching, cancellation and
  invalidation. Filter state lives in the URL, so any view is shareable.

## Configuration

Copy `.env.example` to `.env`. Every variable is validated at startup by
`server/src/config/env.ts`, so a bad value fails the boot rather than surfacing
later as a confusing runtime error.

| Variable        | Default                 | Purpose                             |
| --------------- | ----------------------- | ----------------------------------- |
| `PORT`          | `3000`                  | API port                            |
| `NODE_ENV`      | `development`           | `development`, `test`, `production` |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed CORS origin                 |
| `DATA_DIR`      | `<cwd>/data-store`      | Where `cocktail.db` is written      |
| `LOG_LEVEL`     | `info`                  | `debug`, `info`, `warn`, `error`    |

## Docker

```bash
docker compose up --build
```

The image serves the built client from Express on port 3000, runs as the
unprivileged `node` user, and keeps the database on the `cocktail-db` volume at
`/data`.

> **Note:** the Docker build is not yet covered by CI — it has not been run
> end to end on a machine with a working Docker daemon. The application itself
> is verified on every push (lint, types, 231 tests, coverage, production
> build); only the image packaging is unproven.

## Contributing

See [AGENT.md](AGENT.md) for conventions, commit format, and development workflow.

## License

[MIT](LICENSE)
