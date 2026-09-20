# Quality Baselines
Current quality metrics. §4 gates use these as minimum thresholds.

| Metric | Baseline | Target | Measured | Date |
|--------|----------|--------|----------|------|
| Test coverage (∆) | — | ≥80% | — | — |
| Critical path coverage | — | 100% | — | — |
| Build warnings | — | 0 | — | — |
| Lint warnings | — | 0 | — | — |
| Security audit warnings | — | 0 | — | — |
| Test determinism | — | 100% | — | — |
| Dependency freshness | — | ≤30d | — | — |
| Engine success rate (sonnet) | — | ≥90% | — | — |
| Engine timeout rate | — | ≤5% | — | — |
| Engine §4 pass rate | — | ≥80% | — | — |

Rules:
- Update after each milestone or release
- Baseline = current state · Target = §4 gate requirement
- ∆ metrics measure change from baseline, not absolute
- Regression below baseline → §5.F → revert+investigate
