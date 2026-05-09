# MISTAKES — {{PROJECT_NAME}}

> Append-only log of every meaningful mistake we've made and the rule
> we adopted to prevent it. Per CONSTITUTION §G.1, every production
> incident lands here. The Checker subagent reads this file on every
> review.

**Format:** Newest entries on top. Tag each entry with `[area]` so
agents can filter (e.g., `[auth]`, `[performance]`, `[mobile]`).

---

## Schema

Each entry:

```
### {{DATE-YYYY-MM-DD}} — short title  [tag1, tag2]

**What happened:** 1–3 sentences describing the failure mode.

**Root cause:** the actual cause, not the symptom.

**Rule adopted:** the durable rule that prevents recurrence.

**Regression test:** path/to/test.ts — name of the test that fails
on the bug, passes on the fix. (Per CONSTITUTION §G.2.)
```

---

<!-- Add new entries below this line. Newest first. -->
