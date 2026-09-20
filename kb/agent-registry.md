# Agent Registry
Pattern-based agent configuration. Match→auto-configure. Temp→permanent@3+ uses.

| Pattern | When | Agents | Model | Tools | Skills | MCP | Risk-gates | History |
|---------|------|--------|-------|-------|--------|-----|------------|---------|
| new-feature | task assigned | planner→critic∥sec-rev→implementer→reviewer∥sec-rev | sonnet | read+write | workflow-feature,tdd-workflow,commit-workflow | — | §4a+§4b | — |
| bug-report | test fail / incident | debugger→implementer→reviewer∥sec-rev | sonnet | read+test+lw | debugging,tdd-workflow | — | §4.Cor+Tst | — |
| pre-release | release trigger | release-coordinator | sonnet | read+shell+write(docs,tags) | release,dependency-audit | — | §4 all | — |
| kb-maintenance | every 5 tasks | kb-curator | haiku | write(kb,tasks) | kb-prune,kb-templates,retrospective | — | — | — |

Rules:
- complement ∅ identical — agents must have distinct roles
- dup-detect: scope-overlap → cancel junior agent
- conflict → evidence → ADR
- temp → perm @ 3+ successful uses
