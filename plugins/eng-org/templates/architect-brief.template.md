# Architect Brief — <subsystem-or-batch-name>

> Binding context for the `architect` agent. Every section MUST be
> filled. Sections marked N/A must say so explicitly with a one-line
> reason. The architect agent refuses to run if any section is
> empty.

---

## §1 Product surface

What user-visible capabilities are in scope. Reference the
capability matrix, drawings, or PRD. Be concrete.

Example:
- Real-time pet vitals (HR, location, steps, sleep)
- Geofence CRUD + enter/exit alerts
- Multi-collar / multi-pet ownership

---

## §2 Scale target

Numbers, not adjectives. Every row required.

| Metric | Today (1×) | 1 year (10×) | 3 year (100×) | Long-horizon (1000×) |
|---|---|---|---|---|
| Users | | | | |
| Devices/user (avg) | | | | |
| Events/device/day | | | | |
| Sustained msg/sec | | | | |
| Peak msg/sec | | | | |
| Concurrent WS connections | | | | |
| DB rows in hot tier | | | | |
| Retention horizons (hot/warm/cold) | | | | |
| Geographic regions | | | | |

If a row is unknown, write "unknown — assume <number>" with a
reasoning line. The architect treats your assumption as the design
target.

---

## §3 Hardware / external protocol (or N/A)

If the work integrates an external system, name it and link the
spec. Identify:
- Message types in scope
- Delivery semantics (at-most-once / at-least-once / exactly-once)
- Ordering guarantees
- Authentication / authorisation model
- Rate limits / throttles imposed by the external party

If N/A, say so.

---

## §4 LOCKED tech stack

Items the architect may NOT replace, only build on top of.

Example:
- Backend: Node.js, TypeScript, tRPC v11, Drizzle ORM
- Database: PostgreSQL (extensions OK)
- Cache / pub-sub: Redis
- Mobile: Expo + React Native, NativeWind, Reanimated, Expo Router
- Auth: Clerk / Auth0 / custom (specify)
- Infra: <cloud provider>, <orchestration choice>

Anything not on this list, the architect may propose to ADD with
justification, but never to REPLACE a locked item silently.

---

## §5 Cardinality rules

Domain invariants the schema and APIs must honour.

Example:
- 1 user → N pets (many)
- 1 user → N collars (many)
- 1 collar → 1 pet active at any time
- `UNIQUE(petId) WHERE active = true` enforces single active pairing

---

## §6 Work queue (REQs)

The list of REQs this design must support. The architect's ADR
becomes binding context for each of these.

Example:
- REQ-IOT-00 schema
- REQ-IOT-01 MQTT ingest
- … (full list)

---

## §7 Agent inventory

Which specialist agents exist to implement the design. The
architect does NOT design for agents that do not exist.

Example: Devs: dev-trpc, dev-postgres-drizzle, dev-domain,
dev-ui-animation, dev-expo-rn. Tests: test-unit, test-integration,
test-e2e, test-regression, test-load. Reviewers: architecture,
security, performance, standards, observability, indexes.

---

## §8 Pipeline / governance constraints

Mode B is the default for the work in §6. The architect must
respect the iron rules:
- §H.42 No agent self-approves.
- §H.43 Same agent never reused on the same artifact.
- §H.44 Role contracts in ROLES.md are binding.
- §H.45 Communication is artifact-only.
- §H.46 Audit trail under `governance/.audit/`.
- §H.47 Human approval non-negotiable for merge.

Add project-specific gates here (e.g., G-1 visual parity, G-3
device-boot smoke, G-4 batch cap).

---

## §9 Hard constraints (SLOs, compliance)

Non-negotiable numbers.

Example:
- p99 ≤ 100 ms warm for every tRPC procedure
- p99 ≤ 200 ms cold
- 99.9% uptime per quarter
- Zero PII in logs
- GDPR Article 17 — 30-day deletion
- DPDPA India compliance

---

## §10 Banned anti-patterns

Explicit DO-NOT list. The architect refuses to propose these
unless §2 numbers prove necessity.

Example:
- Kubernetes / service mesh
- Microservices split (until team / blast-radius math demands)
- Event sourcing on telemetry (PG append-only IS event sourcing)
- Custom binary protocols
- NoSQL for primary store (PG with partitioning handles target scale)
- GraphQL (we chose tRPC for type safety)
- Speculative future-proofing abstractions
- New build systems or package managers

---

## §11 Output format

The architect produces a versioned ADR doc at:
`governance/architecture/ADR-<arg>-v<X>.<Y>.md`

Structure per `templates/adr.template.md`:
- Executive summary
- Component diagram
- Sequence diagrams
- Capacity table
- ADRs (one per decision)
- Risk register
- Open questions
- Glossary

---

## §12 Open questions for the architect

Things the brief author wants the architect to address explicitly.

Example:
- Is a single Postgres instance sufficient at 1M users, or do we
  need Citus / TimescaleDB from day one?
- WS fanout at 200K concurrent — single Node process, multiple, or
  managed (Centrifugo / Ably)?
- MQTT subscriber model — one process per IMEI-hash shard, or one
  process with bounded queues?

The architect MUST answer each of these in the ADR doc.
