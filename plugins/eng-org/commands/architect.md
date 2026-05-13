---
description: Run the architect agent against a structured brief for a subsystem or batch of REQs. Produces a versioned ADR doc adversarially reviewed by reviewer-architecture / reviewer-security / reviewer-performance.
---

You are running architecture design for a subsystem or REQ batch.

The argument is: $ARGUMENTS — typically a subsystem name (e.g.,
`iot-pipeline`, `payment-platform`) or a REQ batch tag (e.g.,
`REQ-IOT-batch`). This becomes the ADR doc id suffix.

## When to use this command

Use BEFORE `/eng-org:tl-analyze` when:
- A new subsystem is being introduced (e.g., MQTT ingest, payments).
- A REQ batch touches > 3 components or crosses domain boundaries.
- Scale targets in the brief exceed the current production load by
  > 10×.
- A new data-layer pattern is being proposed (partitioning,
  sharding, multi-region).
- The work introduces a new external dependency (vendor, protocol).

You can skip this command for small, well-contained REQs that fit
inside an existing subsystem and a single TL's purview. The EM
makes the call at intake time and records it in `spec.md`.

## Steps

1. **Verify the architect brief exists.**
   Path: `governance/architecture/briefs/<ARGUMENTS>-brief.md`.

   If it does not exist, refuse to proceed and print:

   > Brief not found at
   > `governance/architecture/briefs/<ARGUMENTS>-brief.md`. The
   > architect agent requires a structured brief. Create one from
   > `templates/architect-brief.template.md`, then re-run.

   Do NOT invent a brief on the user's behalf. The brief is the
   binding context.

2. **Run a brief-completeness check** (you, not the agent):
   - §1 Product surface present and non-empty
   - §2 Scale target contains explicit numbers (users, msg/sec, etc.)
   - §3 Hardware / external protocol referenced or marked N/A
   - §4 LOCKED tech stack listed
   - §5 Cardinality rules listed
   - §6 Work queue (REQ list) present
   - §7 Agent inventory listed
   - §8 Pipeline / governance constraints listed
   - §9 Hard constraints (SLOs, compliance) listed
   - §10 Banned anti-patterns listed
   - §11 Output format / ADR template referenced

   If any section is missing or empty, refuse and ask Imran to
   complete the brief.

3. **Pass-1 design.** Spawn a fresh `architect` subagent with the
   brief path as input. The agent will:
   - Read the brief end-to-end.
   - Read `governance/ARCHITECTURE.md`, `governance/CONSTITUTION.md`,
     `governance/ROLES.md`, prior ADRs, and the codebase top-level
     layout.
   - Write `governance/architecture/ADR-<ARGUMENTS>-v1.0.md` with
     the full structure (executive summary, component diagram,
     sequence diagrams, capacity table, ADRs, risk register, open
     questions, glossary).
   - Mark every ADR PROPOSED.

4. **Pass-2 adversarial review.** Spawn three reviewers in
   parallel (single message, three Agent calls):

   - `reviewer-architecture` — verifies layering, ownership,
     consistency with prior ADRs, MODULE_REGISTRY alignment.
   - `reviewer-security` — verifies the security model in the
     ADR doc (auth, PII flow, multi-tenant isolation, attack
     surface).
   - `reviewer-performance` — verifies capacity math: do the
     numbers in each ADR add up against §2 of the brief?

   Each reviewer writes to
   `governance/architecture/ADR-<ARGUMENTS>-v1.0-reviews/<role>.md`
   with verdict APPROVE / NEEDS-CHANGES / BLOCK and line-cited
   findings against the ADR sections.

5. **Pass-3 consolidate findings.** Read all three review files.
   Produce a consolidated findings summary at
   `governance/architecture/ADR-<ARGUMENTS>-v1.0-findings.md`:
   - All BLOCK findings (must be addressed before v1.1).
   - All NEEDS-CHANGES findings (should be addressed).
   - Disagreements between reviewers (route to ADR-level resolution).

6. **Pass-4 architect revision.** If there is at least one
   BLOCK or NEEDS-CHANGES, spawn the `architect` agent AGAIN with
   the consolidated findings doc as additional input. The agent
   will:
   - NOT rewrite the whole ADR doc.
   - Revise only the affected ADR sections.
   - Bump version to v1.1.
   - Mark superseded ADRs with new ADR ids.
   - Write `governance/architecture/ADR-<ARGUMENTS>-v1.1.md`.

7. **Re-review** v1.1 with the same three reviewers (Pass-2 again).

8. **Stop conditions.**
   - All three reviewers APPROVE → ADR is ACCEPTED. Update its
     header status. Print: "ADR-<ARGUMENTS> ACCEPTED at version
     vX.Y. Run `/eng-org:tl-analyze REQ-<id>` for each REQ in the
     batch. TLs MUST read this ADR before decomposing tasks."
   - Two iteration rounds completed and still BLOCK → escalate to
     EM with a "Decision-required" note. Print:
     "ADR-<ARGUMENTS> requires EM decision. See findings at
     `<path>`."

9. **Hard rules** (binding on this command's orchestration):
   - The architect agent never reviews its own output.
   - No reviewer ever modifies the ADR.
   - No TL agent runs until status flips to ACCEPTED.
   - The orchestrator (this command) never silently auto-approves.
     If two rounds pass and reviewers still BLOCK, escalation is
     the only option.

## Output expectations

After this command completes you will have:
- `governance/architecture/ADR-<ARGUMENTS>-v<X>.<Y>.md` (ACCEPTED
  or marked Decision-required).
- A reviews folder with one verdict per reviewer.
- A findings doc summarising what changed between revisions.
- Updated `governance/architecture/INDEX.md` (one-line pointer to
  the latest accepted ADR for this subsystem).

## What this command does NOT do

- Dispatch any Dev or Test agent.
- Modify `MODULE_REGISTRY.md` or `ARCHITECTURE.md` — those updates
  happen during `/eng-org:tl-analyze` once the ADR is accepted.
- Replace `reviewer-architecture` on the per-task code review.
  This is system design; that is code review. Both still run.
