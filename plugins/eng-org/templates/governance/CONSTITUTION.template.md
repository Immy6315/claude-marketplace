# Constitution — {{PROJECT_NAME}}

> Project rules. Sections §A–§G are project-owned (you fill them).
> Section §H is framework-owned (eng-org sets the multi-agent process
> rules; do not edit unless you've thought about it carefully — `eng-org
> update` will rewrite §H from the framework).

**Version:** 0.1.0  **Last reviewed:** {{DATE}}

---

## §A. Privacy & data handling

> *TODO — fill with your project's rules around PII, logging, retention,
> right-to-be-forgotten. Examples: "Email and phone never logged.
> Payment IDs hashed. Audit log retention 90 days."*

- A.1.
- A.2.
- A.3.

---

## §B. Data layer

> *TODO — fill with your DB rules. Examples: "All FKs indexed. No
> N+1. Pagination required on list endpoints. Migrations are
> two-deploy when columns are dropped."*

- B.1. Indexes match access patterns. Every column used in a
  `where` clause on a hot path must be indexed.
- B.6. No N+1. A loop calling the DB once per row is a BLOCKER.
- B.7. Pagination required on every history / list endpoint with
  expected size > 100.
- B.13. Critical-path code (domain logic, money math, auth flows)
  must hit ≥ 95% line + branch coverage.

---

## §C. API layer

> *TODO — fill with your API rules. Examples: tRPC procedure-type
> discipline, Zod validation, error taxonomy, rate limits.*

- C.15. Authorization invariant: every read or write of a per-user
  resource passes through an explicit ownership check.
- C.18. Auth endpoints declare a rate limit. Missing is a BLOCKER.

---

## §D. Mobile / frontend

> *TODO — fill with your frontend rules. Examples: safe-area handling,
> animation discipline, accessibility, bundle-size budgets.*

- D.1.
- D.2.

---

## §E. Architecture & layering

> *TODO — fill with your layering rules. Examples: domain layer is
> pure (no DB, no IO), services depend on ports not concrete adapters,
> no circular imports.*

- E.27. Domain layer (`domain/*`) is pure: no DB, no Express, no
  fetch, no `Date.now()` without injection.

---

## §F. UX & user-visible behavior

> *TODO — fill with rules about how the product behaves.*

- F.1.

---

## §G. Learning loop

> *TODO — how the team turns mistakes into rules.*

- G.1. Every production incident produces a MISTAKES.md entry with
  enough detail to write a regression test.
- G.2. Every MISTAKES.md entry that names a code pattern gets a
  test that fails on the bug, passes on the fix.

---

## §H. Multi-agent process (Mode B) — framework-owned

> Do not edit by hand. `eng-org update` rewrites this section from
> the framework. If you need to override a rule for a specific REQ,
> do it in `governance/TECH_DEBT.md` with sign-off.

- **42.** No agent self-approves. Every approval comes from a peer or
  parent role. The merge approval comes from the human (Imran or the
  designated approver), never from an agent.
- **43.** Same agent is never reused on the same artifact. Reviewers
  are always fresh subagents. Test agents are independent of the Dev
  who wrote the code.
- **44.** Role contracts in `ROLES.md` are binding. Each agent reads
  its required-reading list fresh from disk every invocation.
- **45.** Communication is artifact-only. Agents do not read each
  other's working memory; they read each other's output files in
  `governance/requirements/REQ-<id>/`.
- **46.** Audit trail is mandatory. Every agent invocation appends to
  `governance/.audit/REQ-<id>/<ISO-timestamp>-<role>-<id>.md` with the
  prompt, the output, and the exit status.
- **47.** Human approval is non-negotiable for merge. The framework
  stops at "production-ready PR approval"; deployment is human-controlled.
- **48.** Changes to `ROLES.md` or `CONSTITUTION.md` itself follow Mode
  B (full pipeline). The framework eats its own dogfood.
- **49.** Triage (Mode A vs Mode B) is the first decision per
  requirement and is recorded in writing in
  `governance/requirements/REQ-<id>/spec.md`.

---

## How to amend this Constitution

1. Open a Mode B requirement: `/eng-org:em-intake "amend §X to ..."`.
2. The EM agent runs the full 5-role pipeline (yes, even on a
   Constitution change — rule §H.48).
3. After APPROVED, bump the version at the top of this file.
4. Add a row to the changelog at the bottom.

---

## Changelog

| Date | Version | What changed | REQ |
|---|---|---|---|
| {{DATE}} | 0.1.0 | Initial scaffold from eng-org init | — |
