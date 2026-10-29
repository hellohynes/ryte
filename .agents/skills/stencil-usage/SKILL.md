---
name: stencil-usage
description: Build or change Ryte renderer UI with Stencil, the design system. Use for any renderer UI work that touches a button, input, dialog, menu, notice, text, spacing, color, or icon, before writing markup or CSS, and when adding or changing a Stencil component.
---

# Stencil Usage

Reach for Stencil first. Stencil is hand-built, with no component library, under `app/src/renderer/src/stencil/`. Names: `--st-*` tokens, `st-*` classes, `St*` Vue components, `data-st-*` attributes.

## The ladder

Take the first rung that fits:

1. A Stencil component. Read `stencil/manifest.json` for its props, emits, slots, keyboard contracts, and a usage example. It is generated from the code, so it is current.
2. A Stencil token in your own CSS: `--st-space-*`, `--st-block-*`, `--st-layout-*`, `--st-color-*`, `--st-type-*`, `--st-shadow-*`, `--st-ring-*`, `--st-border-*`, `--st-radius-*`.
3. Custom CSS, and say so in the PR: "no Stencil component covers X". That feeds the extract-on-second-use rule.

Run `pnpm stencil` from `app/` to see every component, token, and icon in light and dark.

## Rules

- Tokens only. No hard-coded colors, no px sizes, no raw font sizes. `em` for sizes that scale with their own text is allowed. `pnpm check:stencil` fails on a raw color or px outside `stencil/`.
- Text uses `StText` (a type role) or a `--st-type-*` role. Layout uses `StStack` and `StBox`. Controls use `StButton`, `StIconButton`, `StInput`, `StField`, `StSelect`, `StCheckbox`, `StSegmented`. Messages use `StNotice`. Icons use `StIcon` (the `stencil-icon` skill adds one).
- Overlays use `StDialog`, `StPopover`, `StMenu`, `StTooltip`, `StToaster`/`toast()`, `StDisclosure`. Never a raw `<dialog>`, `popover`, `showModal()`, or a hand-rolled menu outside `stencil/`; `pnpm check:stencil` fails on them. Escape closes only the top layer and focus returns to the opener; the components do this for you.
- Behavior composables (`stencil/behaviors/`) are Stencil's plumbing. The app imports components, not composables; an ESLint rule enforces it. If a widget needs one, that widget belongs in `stencil/`.
- Color follows the theme through semantic tokens. `data-theme="dark|light"` on any element forces a theme there. Check both themes.

## Adding or changing a component

Add a component only when a second place needs it. Then:

1. Put it in `stencil/components/` with a one-line `/** description */` at the top of its `<script setup>`, typed props, and JSDoc on each prop. Variants are props that become `data-st-*` attributes; CSS reads tokens only. Prop-driven CSS is generated from `*-props.ts` by `pnpm stencil:tokens`; hand-written chrome goes in `controls.css` or `overlay.css`.
2. Give it a gallery entry in `stencil/gallery/sections/`, with its states.
3. If it has keyboard or top-layer behavior, write its keyboard contract in `scripts/stencil-test/scenarios.mjs` against the WAI-ARIA Authoring Practices table, with `covers: ['StName']`. Pure logic goes in a node test beside it. Run `pnpm test:stencil`.
4. Run `pnpm stencil:manifest`, `pnpm stencil:tokens`, and `pnpm check:stencil`.

## Verify

`pnpm validate` runs token and manifest freshness, conformance, lint, types, tests, and the build. `pnpm test:stencil` runs the keyboard contracts in real Chromium. For a visible change, compare before and after builds in the running app in both themes.
