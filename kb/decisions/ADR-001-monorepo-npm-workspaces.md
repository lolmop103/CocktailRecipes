# ADR-001: Monorepo with npm Workspaces

| Field | Content |
|-------|---------|
| ID | ADR-001: Monorepo with npm workspaces |
| Date | 2026-04-24 |
| Status | Accepted |
| Context | New full-stack project needs a structure for a Node/Express backend and a React frontend sharing no code initially but likely to share types in the future. |
| Options | (1) npm workspaces monorepo — native Node ≥20, zero extra tooling · (2) pnpm workspaces — better deduplication, but requires pnpm install as prerequisite · (3) Separate repositories — maximum isolation, but split CI, harder to share types · (4) Single package flat layout — simple now, hard to split later |
| Decision | Option 1: npm workspaces monorepo (`server/`, `client/` as workspace packages). |
| Consequences | CI runs `npm install` at root; scripts delegate to workspaces. Adding a `shared/` package later is straightforward. Requires Node ≥20 on all developer machines and CI. |
| Trigger | Revisit if pnpm workspace-specific features (e.g., strict peer deps, catalogs) become needed. |
