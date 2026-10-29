# Implementation

Before editing repository files, prove all of the following:

- the user explicitly asked to implement or resume implementation;
- the plan is `approved`, and `approved_hash` equals the current `plan_hash`;
- repository and branch identity still match the plan;
- both review lenses covered the current hash and all Blocker/Decision findings are terminal;
- one selected slice is dependency-ready;
- the working tree is clean on a non-protected feature branch; and
- the selected paths and behavior remain inside user authorization.

State the selected slice's visible result, evidence strategy, independent oracle, wrong
implementation, and expected proof. Implement only that vertical slice. Stop for a material product,
architecture, persistence, privacy, or scope deviation; revise and review the plan before continuing.

Record the changed paths, exact evidence, result, deviations, and residual risk in the slice evidence
ledger. A later relevant edit invalidates the affected evidence.
