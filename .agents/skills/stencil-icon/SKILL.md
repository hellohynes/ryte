---
name: stencil-icon
description: Create, redraw, or review an icon in Ryte's Stencil icon set. Use when an interface needs a new icon, an existing icon looks off at small sizes, a brand mark is needed, or icon style is being reviewed in the gallery.
---

# Stencil Icon

Add or change an icon so it matches the set and ships as one filled `currentColor` shape.

## Where things live

All under `app/src/renderer/src/stencil/`:

- `icons/icon-spec.ts`: the drawings, as centerlines. The only file you edit to draw.
- `icons/brand-marks.ts`: path data for provider marks.
- `icons/icons.generated.ts`: outlined output. Generated; never edit.
- `icons/StIcon.vue`: `<StIcon name="search" :size="16" />`.
- `gallery/`: `pnpm stencil` shows every icon at 12, 16, 24 and 48 px and at each stroke weight.

## Style rules

- 16px grid. Keep centerlines inside 2 to 14, so the outlined edge stays inside 1.25 to 14.75. The generator fails and lists any icon outside it.
- Stroke 1.5, flat caps, round joins, soft corners (radius 1 to 2). Weight is one value for the whole set (`STROKE_WIDTH`); never per icon.
- Drawn only from strokes and dots. No fills for shapes, no baked opacity, no colors. Output is `currentColor`.
- Simple at 12px: one idea per icon, no detail finer than a 1.5px gap. If an inner corner closes up at 16px, remove detail or widen it.
- Direction variants are rotations of one drawing (`turn(points, quarters)`), never redrawn.
- Letters and digits share one cap height. A round join or arc extends past its centerline by 0.75, so inset those centerlines by 0.75 and leave flat-capped ends on the cap line.
- Contours that turn a corner are one path, so the join is round. A path that starts or ends at a corner leaves a notch; close it or end it on another stroke.
- Names are lowercase kebab-case, noun first: `chevron-left`, `list-bullet`, `sidebar-close`.
- Brand marks (`openai`, `anthropic`) are single-path fills set in `brand-marks.ts` from an official or Simple Icons source, and scale to fit the live area. They are not restyled.

## Workflow

1. Check the set for an existing icon or a rotation of one before drawing.
2. Add an entry to `ICON_SPEC` in `icon-spec.ts` with `strokes` (SVG path data or helpers: `line`, `rect`, `circle`, `arc`, `polar`, `turn`) and optional `dots` or `brand`. Use `arc(cx, cy, r, from, to)` for arcs instead of hand-written SVG arc flags.
3. Run `pnpm stencil:icons` from `app/`. Fix any icon it reports outside the live area.
4. Register the name in `ICON_GROUPS` (`gallery/gallery-model.ts`) and in `EXPECTED` (`icons/icons.test.ts`, alphabetical). Add a test when the icon has a rule worth keeping, such as a mirrored pair or a shared cap height.
5. Run `pnpm stencil` and inspect the icon at 12 and 16 px in light and dark, then at 48 px for shape quality. Compare it beside its neighbors for weight and size.
6. Use it with `StIcon`. Size it with the `size` prop or CSS `width` and `height`; the drawing scales with it. Never set stroke properties on it. Animate with `clip-path` or `transform`, not stroke dashes.
7. Run `pnpm stencil:icons --check`, `pnpm vitest run src/renderer/src/stencil`, `pnpm lint`, and `pnpm typecheck`.

## Output

Report the icon names added or changed, how each looks at 12 and 16 px, and any rule you bent. Include the gallery screenshot or describe what was inspected.
