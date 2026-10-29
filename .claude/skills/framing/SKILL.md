---
name: framing
description: Create a Ryte framing document before shaping a feature, phase, UX redesign, or architecture change. Use when the user provides rough ideas, design screenshots, product goals, prior decisions, or tradeoffs and wants the problem, outcome, appetite, boundaries, source material, and deferred work captured before solution shaping.
---

# Ryte Framing

Use this skill to capture the "why" for a Ryte effort before comparing solution shapes or writing implementation tasks.

## Ground Rules

- Preserve source material separately from interpretation.
- Keep Ryte local-first unless the user explicitly frames a future sync or cloud capability.
- Do not read or quote real note content unless the user explicitly asks for that exact content.
- Keep the frame solution-agnostic. The frame says what problem is worth solving and what success looks like; shaping decides how.
- Put framing artifacts in `${RYTE_SESSION_NOTES_ROOT:-$HOME/notes/sessions}/YYYY-MM-DD/`.

## Workflow

1. **Capture Source**
   - Record the user's relevant words, design notes, screenshots, constraints, and decisions.
   - Use short quoted excerpts or concise paraphrase when the source is the current conversation.
   - Include links or file references when available.

2. **Extract Problem**
   - State what is broken, missing, confusing, or risky.
   - Keep the claims traceable to the source.
   - Separate evidence from inference.

3. **Define Outcome**
   - State what should be true when the effort succeeds.
   - Keep outcomes high-level and non-solution-specific.

4. **Set Appetite**
   - Name the intended size: spike, one PR, one phase, multi-phase, or release milestone.
   - Include constraints such as "must not weaken local-only search" or "must remain read-only."

5. **Draw Boundaries**
   - List what the effort is less about and more about when there is an obvious wrong direction.
   - Explicitly defer future features.

6. **Recommend Next Step**
   - End with one recommendation: `shape next`, `spike first`, or `not ready`.

## Frame Template

```markdown
---
shaping: true
project: ryte
phase: phase-N
---

# Ryte Phase N: [Title] - Frame

## Source

> [Verbatim or near-verbatim user material.]

## Problem

- [Traceable problem statement.]
- [Traceable problem statement.]

## Outcome

- [High-level success condition.]
- [High-level success condition.]

## Appetite

[Spike, one PR, one phase, multi-phase, release milestone.]

## Constraints

- [Privacy, local-first, architecture, security, schedule, or UX constraint.]

## Less About

- [Wrong direction or non-goal.]

## More About

- [The actual nature of the problem.]

## Explicitly Deferred

- [Deferred item.]

## Open Questions

| ID  | Question   | Why It Matters              |
| --- | ---------- | --------------------------- |
| FQ1 | [Question] | [Risk or decision affected] |

## Recommended Next Step

[shape next / spike first / not ready] because [reason].
```

## Quality Bar

- Do not turn a frame into a task list.
- Do not invent roadmap order for deferred ideas.
- Do not present assumptions as source-backed facts.
- Keep the frame short enough to be reread before each shaping session.
