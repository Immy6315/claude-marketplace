# Architecture Decision Record — <Project / Subsystem> v<NN>.<N>

> Authored by the `architect` agent against
> `governance/architecture/briefs/<subsystem>-brief.md`.
> Reviewed adversarially by `reviewer-architecture` +
> `reviewer-security` + `reviewer-performance`.
> Status flips to ACCEPTED only after all three APPROVE.

---

## Executive summary

Three short paragraphs:

1. **Scope** — what subsystem boundary this doc covers (and what it
   does NOT cover).
2. **Three biggest decisions** — name the three load-bearing
   decisions and the brief §2 number that drove each.
3. **Top accepted risk** — the biggest known risk we are signing up
   to, and the metric / dashboard that detects it early.

---

## Component diagram

ASCII or Mermaid. Show the proposed runtime topology with ownership
labels (which agent / domain owns each box). Example:

```
                ┌──────────────────────┐
                │  Mobile (dev-expo-rn)│
                └──────────┬───────────┘
                           │ tRPC over HTTPS
                ┌──────────▼───────────┐
                │  API (dev-trpc)      │
                └─┬────────────────────┘
                  │
       ┌──────────┼──────────────┐
       │          │              │
 ┌─────▼────┐ ┌───▼────┐  ┌──────▼──────┐
 │ Postgres │ │ Redis  │  │ MQTT bridge │
 │ (drizzle)│ │ pubsub │  │ (ingest)    │
 └──────────┘ └────────┘  └─────────────┘
```

---

## Sequence diagrams

One per critical user-visible flow. Each hop must show its latency
allocation against the §9 SLO.

Example flows:
- Pairing (mobile → backend → collar)
- Telemetry ingest (collar → MQTT → backend → DB)
- Live vitals fan-out (DB write → Redis pub → WS → mobile)
- Push delivery (event → backend → APNs/FCM → device)

---

## Capacity table

Brief §2 rows × components columns. Each cell either "fits at
<number>" or "needs migration at <metric>".

| Brief §2 metric | Today (1×) | 1 year (10×) | 3 year (100×) | Long-horizon (1000×) |
|---|---|---|---|---|
| Users | | | | |
| Sustained msg/sec | | | | |
| Peak msg/sec | | | | |
| Concurrent WS | | | | |
| DB hot-tier rows | | | | |
| ... | | | | |

Cells must include either an absolute number ("fits at 12K rps")
or a named migration trigger ("needs partitioning at 500M rows").

---

## ADRs

One entry per decision. Follow the structure below exactly.

### ADR-NN · <Decision title>

**Status:** PROPOSED · ACCEPTED · SUPERSEDED-BY-<NN> · DEPRECATED
**Date:** YYYY-MM-DD
**Brief reference:** §<X> of architect-brief.md
**Supersedes:** ADR-<NN> (if applicable)

#### Context
What problem we are solving. Cite brief sections that motivate the
decision. Numbers required if scale-driven.

#### Options considered
- **A) <name>** — short summary
  - Pros: …
  - Cons: …
  - Cost: dev-time, infra-cost, ops-burden
  - Migration risk if we pick A and later switch
- **B) <name>** — short summary (same fields)
- **C) <name>** — short summary (same fields)

(Minimum 2 alternatives. "No alternative" must be defended.)

#### Decision
We choose **<letter>** because <single primary reason grounded in
brief §X numbers>.

#### Capacity proof
Math showing this handles brief §2 targets:
- Today (1× scale): <numbers>
- 10×: <numbers>
- 100×: <numbers>
- 1000× / long-horizon: <numbers + revisit metric>

#### Consequences
- Positive: …
- Negative / cost: …
- Required follow-up: ADRs implied by this one.

#### Reversibility
- Difficulty to undo: low / medium / high — with reasoning.
- Trigger to revisit: which metric / scale threshold forces a re-look.

#### Verification
- Which test layer / SLO probe verifies this decision is holding.
- Which dashboard / alert in `governance/observability/` watches
  it in production.

---

## Risks register

Top 10 risks ordered by severity. Each row:

| # | Risk | Likelihood | Impact | Mitigation owner | Linked REQ / ADR |
|---|---|---|---|---|---|
| 1 | | L/M/H | L/M/H | TL or REQ id | |
| 2 | | | | | |

---

## Open questions

Things the brief did not specify and that the architect flagged
rather than silently inventing an answer for. Each must name the
question, the dependency that needs it answered, and the proposed
owner.

---

## Glossary

Acronyms and project-specific terms defined exactly once.

| Term | Definition |
|---|---|
| | |
