# Decision Rationale
Cross-session: significant decisions with alternatives considered.
<!-- Format: [Date][ID] Decision | Options considered | Chosen | Why | Trigger to revisit -->

[2026-04-24][ADR-001] Monorepo with npm workspaces | Options: single package, yarn workspaces, pnpm workspaces, separate repos | Chosen: npm workspaces | Why: native Node ≥20 support, no extra tooling, simplest for small team | Revisit: if pnpm workspace features become needed
