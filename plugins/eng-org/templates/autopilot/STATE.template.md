program: {{PROG_ID}}
phase: GATED            # GATED | RUNNING | CHECKPOINT-WAIT | DONE | HALTED
current_milestone: (none)
current_req: (none)
iteration: 0
budget: {max_fix_iterations_per_req: 5, max_adr_revisions_per_milestone: 3, checkpoint_mode: blocking}
adr_revisions: {}
fix_iterations: {}
parked: []

## Authority grants

<!-- Decision classes the owner granted the loop at the G-9 gate.
     Mid-loop ambiguity INSIDE a class => decide-and-log (ASSUMPTIONS.md).
     OUTSIDE every class => park the REQ. -->
- (none granted yet)

## Iteration log

<!-- One line per iteration, appended by autopilot-iterate:
     [YYYY-MM-DD HH:MM] iter <n> | REQ-<id> | <stage> | <result> | fingerprint: <hash> -->
