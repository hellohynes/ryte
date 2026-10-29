---
name: breadboard-reflection
description: Review and harden Ryte breadboards, shaping docs, slices, or implementation plans before build work starts. Use when the user asks for a critique, reflection, hardened pass, gap analysis, ripple check, resilience review, or consistency check across Ryte framing, shaping, breadboarding, and slice artifacts.
---

# Ryte Breadboard Reflection

Use this skill to critique a Ryte plan after framing, shaping, or breadboarding and before implementation.

## Ground Rules

- Review the artifact as a Staff Engineer: identify gaps, brittle assumptions, privacy risks, architecture drift, missing validation, and sequencing mistakes.
- Keep tables as the source of truth. If a diagram and table disagree, the table wins and the diagram should be regenerated.
- Check consistency across frame, shaping, breadboard, slices, and slice plans.
- Keep Ryte local-first and read-only boundaries explicit unless the selected shape intentionally changes them.
- Do not read real note content as validation evidence unless the user explicitly approves that specific operation.

## Reflection Pass

1. **Artifact Inventory**
   - List the frame, shaping doc, breadboard, slices, and spike docs being reviewed.
   - Note missing artifacts.

2. **Source-to-Outcome Check**
   - Verify the problem and outcome trace back to source material.
   - Flag assumptions that became "facts" without evidence.

3. **Requirement Fit Check**
   - Verify every selected-shape claim maps to a requirement.
   - Flag tautologies where a shape part merely restates a requirement instead of naming a mechanism.
   - Flag requirements with no visible affordance or code affordance.

4. **Breadboard Integrity Check**
   - Verify every UI affordance wires to code/store/main-process behavior where needed.
   - Verify every code affordance has a clear owner and boundary.
   - Verify renderer/preload/main boundaries are visible.
   - Verify local persistence, indexing, and provider behavior are explicit when affected.

5. **Slice Quality Check**
   - Verify every slice ends in demoable UI.
   - Flag horizontal slices that only add infrastructure with no visible outcome.
   - Verify risky unknowns are spiked before dependent slices.
   - Verify validation is realistic and does not require private note content.

6. **Ripple Check**
   - If a requirement, shape part, affordance, or slice changes, update affected levels in the same pass.
   - Record what changed and what downstream artifacts were updated.

## Review Output

Use this format:

```markdown
## Reflection Summary

[One paragraph on readiness.]

## Findings

| Severity | Finding | Evidence               | Recommendation |
| -------- | ------- | ---------------------- | -------------- |
| High     | [Issue] | [Artifact row/section] | [Fix]          |

## Missing Mechanics

| ID  | Unknown    | Blocking? | Next Step               |
| --- | ---------- | --------- | ----------------------- |
| X1  | [Mechanic] | Yes/No    | Spike/update breadboard |

## Slice Adjustments

| Slice | Issue   | Adjustment |
| ----- | ------- | ---------- |
| V1    | [Issue] | [Change]   |

## Ripple Updates Required

- [Frame/Shaping/Breadboard/Slices update needed.]

## Readiness

[Ready to implement / needs spike / needs reshaping.]
```

## Severity Guide

- **High**: likely privacy regression, architecture boundary violation, missing mechanism for a must-have requirement, or slice plan cannot be implemented safely.
- **Medium**: unclear ownership, brittle sequencing, missing validation, UI state ambiguity, or likely rework.
- **Low**: naming, doc clarity, polish, or useful follow-up that does not block implementation.

## Common Ryte Issues To Catch

- Renderer gaining direct filesystem or credential access.
- Local-only flows accidentally touching provider settings or secrets.
- Search/history/labels/tabs persisting note content beyond the user's settings.
- Source mode drifting from read-only to writable without an explicit shape.
- Labels implied as note metadata instead of Ryte-local metadata.
- Recent files tracking too much behavior instead of opened files.
- Tabs or outline persistence added without clear local storage rules.
- macOS vibrancy/transparency implemented in a way that harms readability or portability.
