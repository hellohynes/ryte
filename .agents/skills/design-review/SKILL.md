---
name: design-review
description: Review Ryte's installed Electron UI for visual hierarchy, accessibility, focus, overlays, window states, density, motion, and error behavior. Use for user-visible UI changes or explicit design review requests.
---

# Ryte Design Review

Review changed UI in the native app, not only its source code.

## Workflow

1. Resolve changed UI, style, layout, interaction, and window files plus adjacent feature context.
2. Check that changed UI uses Stencil components and tokens (`stencil-usage`; `pnpm check:stencil`), and that its keyboard operation, focus entry and return, accessible names, contrast, density, empty/loading/error states, overlays, resize behavior, vibrancy/readability, and reduced motion where relevant.
3. Verify the changed interaction in the installed app or the project's usable Electron harness. Use browser evidence only when it reaches the renderer under review.
4. Run Impeccable on the bounded changed UI target when available; treat findings as advisory evidence.
5. Separate blocking defects, warnings, and optional polish. Do not redesign unchanged product behavior.

## Output

Report visual evidence, interaction evidence, findings by severity, and the smallest necessary follow-up.
