# AGENT_STATE — warm-agent continuation contract

The framework keeps **EM**, **TL**, and **Dev** agents *warm* across pipeline
phases. Every Agent invocation returns an `agent_id`; passing that id to
`SendMessage to: <agent_id>` resumes the same agent with full context
preserved — no cold re-read of spec / task / report files.

Reviewers and Test agents always run **cold** (independence is the
load-bearing property; warm reviewer = echo chamber).

---

## Why

A pipeline run for a single Mode B requirement spawns 25-30 agents.
EM/TL/Dev each repeat reads of `spec.md`, `tl-analysis.md`, task files,
dev-reports, and test reports across phases. On a typical REQ each
cold-read costs ~30-60 sec. Warm continuation cuts that to a focused
follow-up message (~5-10 sec).

Target: ~30-min pipeline → ~10-12 min for a UI-only REQ.

---

## Warm vs cold matrix

| Role | Mode | Why |
|---|---|---|
| `em` (per REQ) | **WARM** | spec → analysis → merge-readiness → em-summary is one author's arc. |
| `tl-<domain>` (per REQ) | **WARM** | analysis → assign → merge-readiness is one TL's arc. |
| `dev-<type>` (per task) | **WARM** | code → fix-iteration → dev-report is one Dev's arc. |
| `reviewer-*` | **COLD** every spawn | Independence is required; warm reviewer is structurally compromised. |
| `test-*` | **COLD** every spawn | Same — independent verification. |

---

## State file: `governance/requirements/REQ-<id>/agent_state.json`

The orchestrator writes this file as agents are spawned. It is the source
of truth for which agents to resume vs spawn fresh.

```json
{
  "req_id": "REQ-20260509-01",
  "created": "2026-05-09T10:00:00Z",
  "updated": "2026-05-09T10:45:00Z",
  "agents": {
    "em": {
      "agent_id": "agent_abc123",
      "status": "warm",
      "last_phase": "em-intake",
      "spawned_at": "2026-05-09T10:00:00Z",
      "updated_at": "2026-05-09T10:00:00Z"
    },
    "tl": {
      "tl-mobile": {
        "agent_id": "agent_def456",
        "status": "warm",
        "last_phase": "tl-analyze",
        "spawned_at": "2026-05-09T10:10:00Z",
        "updated_at": "2026-05-09T10:10:00Z"
      }
    },
    "dev": {
      "TASK-1": {
        "agent_type": "dev-ui-animation",
        "agent_id": "agent_ghi789",
        "status": "warm",
        "last_phase": "implement",
        "spawned_at": "2026-05-09T10:20:00Z",
        "updated_at": "2026-05-09T10:20:00Z"
      },
      "TASK-2": {
        "agent_type": "dev-expo-rn",
        "agent_id": "agent_jkl012",
        "status": "warm",
        "last_phase": "implement",
        "spawned_at": "2026-05-09T10:20:00Z",
        "updated_at": "2026-05-09T10:20:00Z"
      }
    }
  }
}
```

### Field semantics

- `agent_id` — value returned by the `Agent` tool. Empty/missing means no warm
  instance exists.
- `status` — one of:
  - `warm` — usable; SendMessage works.
  - `done` — phase complete but still continuable on next phase.
  - `stale` — context too compressed (orchestrator should spawn fresh and let
    new agent read durable artifacts only).
- `last_phase` — the most recent skill that touched this agent (`em-intake`,
  `tl-analyze`, `tl-assign`, `merge-readiness`, `em-summary`, `implement`,
  `fix-iteration`).
- `spawned_at` / `updated_at` — ISO-8601 timestamps.

---

## Orchestrator protocol (every warm-eligible skill follows this)

```
1. Read governance/requirements/REQ-<id>/agent_state.json (create empty if absent).
2. Resolve target agent slot (em | tl.<domain> | dev.<TASK-id>).
3. If slot.agent_id exists AND slot.status != "stale":
     → Use SendMessage to: <agent_id> with the focused phase prompt.
       The warm agent already has spec/task/prior-report context.
4. Else:
     → Spawn fresh subagent with full context-loading instructions.
     → Capture the new agent_id from the spawn return value.
     → Write/update agent_state.json with the new slot.
5. After phase completes:
     → Update slot.last_phase and slot.updated_at.
     → Persist agent_state.json.
6. If the platform reports the agent is no longer reachable (compressed/expired):
     → Mark slot.status = "stale" and spawn fresh on next phase.
```

---

## Skill-by-skill behavior

| Skill | Action |
|---|---|
| `/eng-org:em-intake` | **Spawn** fresh `em`. Save `agents.em.agent_id`. |
| `/eng-org:tl-analyze` | **Spawn** fresh `tl-<domain>` (first time per REQ). Save `agents.tl.<domain>.agent_id`. |
| `/eng-org:tl-assign` | For each TASK-N: **Spawn** fresh `dev-<type>`. Save `agents.dev.TASK-N.agent_id`. |
| `/eng-org:run-tests` | **Always cold.** Do not read or write `agent_state.json`. |
| `/eng-org:run-reviews` | **Always cold.** Do not read or write `agent_state.json`. |
| `/eng-org:merge-readiness` | **SendMessage** to warm `tl-<domain>`. If absent → spawn fresh, save id. |
| `/eng-org:em-summary` | **SendMessage** to warm `em`. If absent → spawn fresh, save id. |
| Dev fix iteration (after RED test or BLOCK review) | **SendMessage** to warm `dev-<type>` for that TASK with focused fix prompt. |

---

## Failure modes & escape hatches

1. **Context compression** — long pipelines may compress the warm agent's
   context. If an agent's response shows it has lost track of prior phases,
   mark the slot `status: stale` and spawn fresh; the new agent reads only
   the durable artifacts (spec, task file, latest dev/test/review reports).

2. **Skill ordering violations** — if a phase runs out of order (e.g.,
   `merge-readiness` before any task is `implemented`), the orchestrator
   refuses regardless of warm-state availability.

3. **Cross-REQ contamination** — `agent_state.json` is per-REQ. Never reuse
   an agent_id from another REQ.

4. **agent_state.json missing or corrupt** — treat as "no warm agents
   exist", spawn fresh as needed, rewrite the file.

---

## Counter-rule (do NOT make Reviewers/Tests warm)

`reviewer-*` and `test-*` independence is enforced by spawning fresh every
time. ROLES.md §3-4 require independence; warming these would silently
break the framework's correctness guarantee. Never persist their agent_ids.
