# Plan review

Review the plan, not the author. Bind review evidence to the exact `plan_hash` and current source
material. A reviewer does not edit the plan or repository.

## Lenses

1. **Outcome and scope:** unsupported assumptions, unclear intent, non-observable goals, missing
   failure states, unnecessary scope, absent non-goals, and unresolved product decisions.
2. **Mechanism and evidence:** missing ownership or Electron handoffs, horizontal slices, unsafe
   mutation boundaries, tautological evidence, duplicated test layers, stale-evidence risk, and
   unverifiable completion.

Use independent fresh reviews when available; otherwise apply both lenses sequentially and record
`degraded — not cold/independent`.

## Finding format

Report only nonempty groups:

```text
Blocker
- DS-001 · <lens> · <location> · <evidence> · <impact> · <required resolution>

Decision
- DS-002 · ...

Improvement
- DS-003 · ...
```

Every Blocker and Decision must be resolved, accepted, disputed with counter-evidence, or deferred
with an owner and boundary before approval. A material revision changes the hash and requires the
affected lens to review the revised plan again.
