---
name: shaping
description: Shape Ryte features, product phases, UX redesigns, or architecture changes before implementation. Use when the user wants to plan a Ryte effort, compare solution approaches, turn rough designs into requirements, create Phase docs, decide scope, identify unknowns/spikes, or produce a ready-to-breadboard shaping artifact.
---

# Ryte Shaping

Use this skill to turn a rough Ryte idea into a concrete, reviewable shaping document before writing implementation code.

## Ground Rules

- Keep Ryte local-first. Treat notes, labels, recents, search history, tabs, and profile data as private local user data unless a future shape explicitly changes that.
- Keep main-process ownership of filesystem, SQLite/vector storage, provider calls, credentials, and external link handling.
- Keep renderer work UI-only through the typed preload API.
- Do not read or quote real note content while shaping unless the user explicitly asks for that specific content.
- Put shaping artifacts in `${RYTE_SESSION_NOTES_ROOT:-$HOME/notes/sessions}/YYYY-MM-DD/`.
- Do not edit project files on `main` or `master`; shaping docs in notes can be created before a project branch, but repo edits require a branch.

## Workflow

1. **Frame**
   - Capture the source material from the user: design notes, screenshots, decisions, constraints, and open questions.
   - Distill the problem, appetite, and outcome.
   - State what is explicitly deferred.

2. **Requirements**
   - Create numbered requirements `R0`, `R1`, `R2`, etc.
   - Keep the top level to nine or fewer requirements; use sub-requirements when needed.
   - Requirements describe outcomes and constraints, not implementation mechanisms.
   - Mark status as `Core goal`, `Must-have`, `Nice-to-have`, `Deferred`, `Out`, or `Undecided`.

3. **Shapes**
   - Describe mutually exclusive solution approaches as `A`, `B`, `C`, etc.
   - Use short titles, for example `B: Shell state first, visual polish second`.
   - Break each shape into mechanism parts, not intentions.
   - Mark a part with `UNKNOWN` when the implementation mechanism needs a spike.

4. **Fit Check**
   - Build a table comparing every shape to every requirement.
   - Use only `YES` or `NO` in shape columns.
   - Add brief notes only for failures or key tradeoffs.
   - If all shapes pass but one still feels wrong, extract the missing concern as a new requirement and rerun the fit check.

5. **Decision**
   - Pick the selected shape or identify the specific unresolved questions blocking selection.
   - Convert unresolved implementation mechanics into spike docs.
   - Only move to breadboarding when a shape is selected or the user explicitly wants to breadboard alternatives.

## Shaping Doc Template

```markdown
---
shaping: true
project: ryte
phase: phase-N
---

# Ryte Phase N: [Title] - Shaping

## Source

> [Verbatim user material that prompted the shape.]

## Problem

[What is broken, confusing, missing, or risky.]

## Appetite

[Target size: one PR, one phase, multi-phase, spike first, etc.]

## Outcome

[What should be true when this phase lands.]

## Explicitly Deferred

- [Deferred item]

## Requirements

| ID  | Requirement          | Status    |
| --- | -------------------- | --------- |
| R0  | [Outcome/constraint] | Core goal |

## Shapes

### A: [Title]

| Part | Mechanism            | Flag |
| ---- | -------------------- | ---- |
| A1   | [Specific mechanism] |      |

### B: [Title]

| Part | Mechanism            | Flag    |
| ---- | -------------------- | ------- |
| B1   | [Specific mechanism] | UNKNOWN |

## Fit Check

| Req | Requirement             | Status    | A   | B   |
| --- | ----------------------- | --------- | --- | --- |
| R0  | [Full requirement text] | Core goal | YES | YES |

Notes:

- B fails R2 because [brief reason].

## Selected Shape

[Decision and rationale.]

## Spikes

| ID  | Question             | Why It Matters |
| --- | -------------------- | -------------- |
| S1  | [Mechanics question] | [Risk]         |

## Breadboarding Input

[Parts and constraints to pass to breadboard.]
```

## Spike Template

Create a separate file for each spike when unknowns affect implementation sequencing.

```markdown
---
shaping: true
project: ryte
---

# Spike: [Title]

## Context

[Why this is unknown.]

## Questions

| ID    | Question                          |
| ----- | --------------------------------- |
| S1-Q1 | Where does this state live today? |

## Acceptance

The spike is complete when we can describe [the specific mechanics needed to build or decide].
```

## Output Expectations

- Produce a shaping document path and concise summary.
- Keep tables complete when presenting them to the user.
- If updating an existing shaping doc, update affected requirements, shapes, fit checks, spikes, and breadboarding input in the same pass.
- End by recommending either `breadboard next`, `run spike first`, or `ready for implementation slicing`.
