# Plan contract

## Location and identity

Store one design spec for a workstream outside the repository at
`${SESSION_NOTES_ROOT:-$RYTE_SESSION_NOTES_ROOT:-$HOME/notes/sessions}/YYYY-MM-DD/plans/`.
Use `<topic>-design-spec.md`; prefer a ticket prefix only when one actually exists. Resolve the
repository root and destination before writing. Reject the repository root, its descendants, or a
symlink that resolves inside the repository.

Resume a single matching current plan instead of creating a duplicate. If more than one plan could
own the work, ask the user which one is authoritative.

## Frontmatter

```yaml
---
design_spec: true
status: draft # draft | approved | implemented | verified
created: YYYY-MM-DD
updated: YYYY-MM-DD
revision: 1
plan_hash: sha256:<digest>
reviewed_hash: null
approved_hash: null
approval: null
repository: <absolute repository root>
branch: <branch at last update>
---
```

Compute `plan_hash` with `plan-state.mjs hash`. It binds the repository, branch, and plan meaning;
it excludes frontmatter lifecycle fields, review/evidence/handoff ledgers, and each slice's canonical
`- Status:` bullet. Meaningful changes reset review and approval identity.

## Required sections

1. Intent and sources
2. Goal truths
3. Constraints and non-goals
4. Current-system evidence
5. Risks and decisions
6. Vertical slices
7. Plan review ledger
8. Slice evidence ledger
9. Goal verification
10. Handoff

Goal truths use `GT1`, `GT2`, and so on. Each vertical-slice heading begins with `V1`, `V2`, and so
on, and contains Result, Dependencies, Paths, exactly one `- Status:`, and Evidence contract.

## Lifecycle

| Status        | Entry condition                                                                        |
| ------------- | -------------------------------------------------------------------------------------- |
| `draft`       | New, materially revised, or not yet reviewed/approved.                                 |
| `approved`    | Both review lenses cover the current hash and the user approved that exact hash.       |
| `implemented` | Every required slice has current usable evidence.                                      |
| `verified`    | Every goal truth has current independent evidence or an explicitly accepted deviation. |

Advance only `draft → approved → implemented → verified`. A material plan, branch, or repository
identity change returns the plan to the earliest affected status and records why.
