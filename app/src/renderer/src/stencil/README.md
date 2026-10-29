# Stencil

Ryte's design system, hand-built with no component library. Names: `--st-*` tokens, `st-*` classes, `St*` Vue components, `data-st-*` attributes.

```
tokens/        scales, colors, and the generators for tokens.css, colors.css, layout.css, text.css
components/    St* components, their *-props.ts, and generated button.css, input.css, notice.css
behaviors/     layer stack, focus return, roving focus, typeahead, list navigation, anchored placement
icons/         the outlined icon set (stencil-icon skill) and StIcon
gallery/       the page `pnpm stencil` serves: every token, icon, component, and overlay
manifest.json  each component's props, emits, slots, and keyboard contracts (generated)
```

- **Use it:** follow the `stencil-usage` skill (`.agents/skills/stencil-usage/`). Read `manifest.json` for a component's API, or run `pnpm stencil` to see it.
- **Overlays** use the browser's top layer: `StDialog` on `<dialog>`, `StPopover`, `StMenu`, and `StTooltip` on the Popover API. A shared layer stack makes Escape and outside presses close only the top layer, and focus returns to the opener. The app imports components, not `behaviors/` (an ESLint rule enforces it).
- **Generated files** (`tokens.css`, `colors.css`, `layout.css`, `text.css`, `button.css`, `input.css`, `notice.css`, `icons.generated.ts`, `manifest.json`) are rewritten by `pnpm stencil:tokens`, `pnpm stencil:icons`, and `pnpm stencil:manifest`; `--check` fails when they are stale. Do not edit them by hand.
- **Checks:** `pnpm check:stencil` flags hard-coded colors and px, raw dialogs and popovers, and components with no gallery entry or no keyboard contract. `pnpm test:stencil` runs the keyboard contracts (`scripts/stencil-test/scenarios.mjs`) in real Chromium: it builds the gallery and drives it in the repo's Electron with real input events. A simulated DOM is deliberately not used, because it is wrong about modal focus, the Popover API, and anchor positioning.
- **New component:** extract on second use, with typed props, a one-line description, a gallery entry, and (for keyboard or top-layer behavior) a scenario that lists it in `covers`.
