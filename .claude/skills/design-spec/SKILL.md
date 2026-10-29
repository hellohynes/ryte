---
name: design-spec
description: Plan, review, implement, and verify substantial Ryte work through an approved external plan and evidence-backed vertical slices. Use when a cross-process feature, risky bug, release workflow, or multi-slice change needs a durable plan before implementation.
---

# Ryte Design Spec

Use one external design spec to guide substantial work without replacing Ryte's framing, shaping, or breadboarding skills.

## Boundaries

- Use `framing`, `shaping`, and `breadboard` to discover and choose the product shape. Use this skill when the selected work needs an approved, durable execution contract.
- Plan, plan review, and verification write only the external spec or linked external review artifacts. The spec must never live in the repository.
- Implementation requires explicit user intent, an approved exact plan hash, a clean non-protected branch, and one dependency-ready slice. Do not create branches, commits, tags, pushes, PRs, reviews, or releases through this skill.
- Preserve Ryte's Electron ownership boundaries and local-first privacy. Use synthetic fixtures unless the user specifically authorizes work against real notes.

## States

- **Plan:** inspect current evidence and write or revise the external plan.
- **Plan review:** challenge the current plan with outcome/scope and mechanism/evidence lenses.
- **Implement:** complete one approved vertical slice and record its evidence.
- **Verify:** reconcile the current repository with every goal truth and non-goal.

Infer the requested state from the user's request and existing plan. State it before acting.

## Start or resume

1. Resolve the external session-notes location and resume one matching design spec when it exists. Read [the plan contract](references/plan-contract.md) before creating or transitioning a plan.
2. Use `node .agents/skills/design-spec/scripts/plan-state.mjs validate <plan>` before relying on a plan hash or lifecycle state.
3. In Plan state, record observable goal truths, constraints, current-system evidence, risks, vertical slices, and an evidence strategy for every slice. Read [evidence strategy](references/evidence-strategy.md).
4. In Plan review, use both lenses from [plan review](references/plan-review.md). Material revisions reset the plan to `draft` and invalidate review/approval hashes.
5. In Implement, read [implementation](references/implementation.md), select exactly one eligible slice, then capture the declared evidence before proceeding.
6. In Verify, read [verification](references/verification.md). A verified design spec is not PR readiness; use `pr-prep` separately after verification.

## Output

Follow [the output contract](references/output-contract.md). Report exactly one next action.
