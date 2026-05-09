# Architecture — {{PROJECT_NAME}}

> *TODO — describe the system at a level that lets a fresh reviewer
> understand the layering. The `reviewer-architecture` agent reads
> this on every Mode B review and flags layering violations against
> what's documented here.*

**Stack (detected at init time):**
- Backend: `{{BACKEND_STACK}}`
- Frontend: `{{FRONTEND_STACK}}`
- Domains: `{{DOMAINS}}`

---

## §1. System shape (one diagram, two paragraphs)

```
[Mobile / Web client]
       │
       ▼
[API surface] — auth context attached on every protected procedure
       │
       ▼
[Service layer] — orchestrates, calls domain + data
       │
       ├──▶ [Domain layer] — pure functions, no IO (CONSTITUTION §E.27)
       │
       └──▶ [Data layer] — schema + repositories
              │
              ▼
       [Postgres + cache]
```

*TODO — replace with your actual diagram.*

---

## §2. Layering rules

- Controllers (API surface) call services. They never reach into the
  data layer directly.
- Services orchestrate domain + data. They are the only layer
  allowed to compose IO.
- Domain is pure. No `db`, no `fetch`, no `Date.now()` without
  injection.
- Data layer owns schema + repositories. No business logic.

---

## §3. Domains

> One section per declared domain. The TL for each domain owns its
> section.

{{DOMAIN_SECTIONS}}

---

## §4. Data tables

> *TODO — list each table, its primary purpose, and the domain that
> owns it. The `reviewer-architecture` agent verifies cross-domain
> table access during review.*

| Table | Domain | Purpose |
|---|---|---|
| | | |

---

## §5. Auth invariant & SLAs

**Auth invariant** (CONSTITUTION §C.15): every per-user resource
access either passes through an explicit `resource.userId === ctx.user.id`
check or filters by `where userId = ctx.user.id`. Missing this check
is a BLOCKER caught by `reviewer-security`.

**SLAs** (per `COVERAGE_THRESHOLDS.md` load section): hot endpoints
must meet declared p95 / p99 budgets. The `test-load` agent enforces.

---

## §6. Observability

*TODO — describe your logging, metrics, and tracing conventions. The
`reviewer-observability` agent uses this to verify new code paths
emit the expected signals.*
