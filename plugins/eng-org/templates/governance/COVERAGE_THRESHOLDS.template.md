# Coverage thresholds — {{PROJECT_NAME}}

> Hard gates for the test pipeline. Reviewer-standards and the
> `test-*` agents enforce these. Adjust upward as the project
> matures; reductions require a Mode B requirement.

---

## Per-tier targets

| Tier | Line coverage | Branch coverage | Notes |
|---|---|---|---|
| **Critical-path domain** (`domain/*`, money math, auth) | ≥ 95% | ≥ 95% | CONSTITUTION §B.13 |
| **Service / handler layer** | ≥ 80% | ≥ 70% | |
| **Adapters & ports** | ≥ 70% | ≥ 60% | |
| **UI components** | ≥ 60% | n/a | Visual / interaction tested via E2E |
| **Project total** | ≥ 75% | ≥ 65% | |

---

## E2E required flows

> The `test-e2e` agent verifies these flows pass on every Mode B
> requirement that touches the user surface. Add new flows here as
> features ship.

| Flow | Description | Status |
|---|---|---|
| 1. | *TODO — e.g., onboarding from splash to home* | TBD |
| 2. | *TODO — e.g., critical paid action* | TBD |

---

## Load thresholds

> The `test-load` agent enforces these on every Mode B requirement
> that touches a hot path or DB query.

| Endpoint class | p50 | p95 | p99 |
|---|---|---|---|
| Read (cached) | ≤ 50ms | ≤ 150ms | ≤ 300ms |
| Read (DB) | ≤ 100ms | ≤ 250ms | ≤ 500ms |
| Write | ≤ 150ms | ≤ 400ms | ≤ 800ms |

Bundle size delta cap (mobile / web): **+10% per release** without
written EM sign-off.
