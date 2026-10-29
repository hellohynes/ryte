# Verification

Verification proves plan goals against the current repository. It is not a summary of tests and it is
not PR readiness.

1. Recompute the plan hash and verify repository/branch identity.
2. Confirm every required slice has usable evidence and each deferred slice has accepted residual risk.
3. For each goal truth, record current evidence, the wrong implementation it excludes, and `verified`,
   `accepted`, `blocked`, or `unverified`.
4. Recheck non-goals, privacy boundaries, and Electron process ownership.
5. Run owning focused checks and required repository gates for the changed scope.

Advance to `implemented` only when all slice evidence is usable, and to `verified` only when every
goal is verified or explicitly accepted. If proof is unavailable, return `blocked` or `needs decision`
without advancing the lifecycle.
