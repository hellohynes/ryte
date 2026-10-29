# Output contract

```text
Design spec: <absolute external path>
State: Plan | Plan review | Implement | Verify
Status: draft | approved | implemented | verified
Revision: <n> · Plan hash: <sha256>
Review: <fresh | degraded — not cold/independent | not yet run>
Slice: <current/next slice or none>
Evidence: <strategy, result, independent oracle, counterexample>
Deviations / residual risk: <none or concise list>
Next action: <exactly one action>
```

Plan review outputs include only nonempty Blocker, Decision, and Improvement groups. Implementation
names changed paths and exact evidence. Verification maps every goal truth to current evidence.

Only a `verified` plan may recommend a separately invoked `pr-prep`; never claim PR readiness or
perform commits, pushes, PR mutations, release tags, or merges through this workflow.
