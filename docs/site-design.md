# Site design

The rules for the Ryte website (`site/`): how it keeps a clean, high-touch look in the spirit of Apple, Stripe, and Ramp, and how it uses Stencil. The `site-design` skill applies this document; the `site-review` skill checks a change against it; `pnpm check:site` enforces the parts a script can.

## What the site is

One page, static HTML, CSS, and JS in `site/`, deployed to GitHub Pages with the Stencil gallery at `/stencil/` (`pnpm site:build`). The site is Stencil all the way: Stencil's semantic colors in light and dark (it follows the reader's system theme), Geist set in Stencil's type roles, Stencil's scale, elevation, and icons, and the Ryte blue accent. The page background is plain (Stencil's base surface), with no decoration behind the hero: one headline, one sentence, and the download button, centered. The app icon keeps its own colors.

## Principles

| Rule | Meaning here |
|---|---|
| One idea per section | One claim in a headline of eight words or fewer, one supporting sentence, at most one visual. |
| Large type does the work | Display size only in the hero. Section headlines one step down. Body never below 16px. Tight tracking and 1.02 to 1.1 line height on headlines, 1.5 to 1.6 on body. |
| One rhythm | Section padding is one token pair (`--site-section-y`) and one gutter (`--site-gutter`). Gaps inside a section come from the `--st-space-*` scale. No one-off margins. |
| The product is the hero image | Real screenshots of the current app, made from synthetic notes, in both themes (the page picks the one that matches). Never mockups, invented UI, or AI-summary imagery without a real provider run. One consistent window frame. Recapture after any visible app change: `pnpm site:screenshots`. |
| One accent | Neutrals carry the page. Ryte blue is the accent: feature icons and links. The primary action is Stencil's primary button (white on dark, black on light). Nothing else is colored. |
| Depth from light | Elevation uses shadow and ring tokens. Hairlines separate sections. No boxes around plain text. |
| Quiet motion | A single fade-up as sections scroll into view: 260ms, ease-out. Everything stops for reduced motion. |
| Specific, honest copy | Plain nouns and verbs. State limits (unsigned build, Apple Silicon). Every claim is true of the shipped build. Product direction (workstreams: what agents did, kept as Markdown) may lead the headline, but the next line and a visible "In development" label say what ships today. |
| Details signal care | Optical alignment, one icon weight, visible focus, no text overflow at 320px, images with explicit sizes, no layout shift. |

## Using Stencil

- `site/stencil-tokens.css` is generated from Stencil (`pnpm stencil:tokens`). Use `--st-space-*`, `--st-block-*`, `--st-layout-*`, `--st-font-size-*`, `--st-type-*` roles, `--st-border-*`, and `--st-radius-*`. Do not edit it.
- `site/stencil-icons.svg` is a generated sprite of the Stencil icons the page uses (`pnpm stencil:icons`). Add a name to `SITE_ICONS` in `app/scripts/generate-stencil-icons.ts` to ship another. Reference it as `<svg class="icon"><use href="stencil-icons.svg#name" /></svg>`.
- Content sits in one centered column, `--site-pad-x`, `--st-layout-1800` wide (about 1150px); the gutter applies below that width. Sections, the top bar, and the footer all use it, so a wide screen never stretches the app screenshot.
- The root is `62.5%`, so Stencil's rem tokens resolve to the same pixels as in the app and still follow the reader's browser text size. Media-query breakpoints stay in `rem` and are not scaled by it.
- Colors are Stencil's semantic tokens, `--st-color-*`, in light and dark. The site uses only `text-*`, `surface-*`, `border-*`, `accent`, `link`, `focus`, `fill-primary`, and `shadow`, because Stencil's tests prove their contrast in both themes. There are no site-only colors. Outside `:root` there are no raw colors or px sizes.
- Type is Geist (variable, Latin), self-hosted from `site/assets/fonts/` under the SIL Open Font License, with `font-display: swap` and a preload. It is copied from the `@fontsource-variable/geist` package the app already bundles; update both together. No third-party font request is made.

## Section anatomy

Hero, what it does (three short statements with Stencil icons), local by default, release notes, footer. Stencil is linked from the footer only. Roadmap lives on its own page, `site/roadmap.html`: one row per milestone with a status badge (Shipped, In development, Planned), no dates, and only claims the build or the plan supports; keep it in step with the README and release notes. Releases live on `site/releases.html`, newest first, one entry per version with its date, a benefit headline, a short summary, and grouped bullets. Write an entry from what shipped (the GitHub release notes and the merged PRs), say plainly when a version was never published as a download, and add the new entry at the top when a release is tagged. `pnpm check:site` runs its HTML checks on all three pages. A new section follows the same pattern: a `section` with the shared padding and a hairline above it, an `h2`, one supporting sentence, and content on the shared gutter. Add `reveal` to the elements that should fade in.

## Guardrails

`pnpm check:site` fails on: a raw color or px size outside `:root`; a Stencil color token outside the allowed set; a token or asset the CSS references that does not exist; content hidden without the `js` class; missing reduced-motion handling; not exactly one `h1`; a skipped heading level; a missing `lang`, `alt`, or image size; a broken anchor, asset, or icon id; a third-party request on load; HTML, CSS, and JS over 60 KB gzipped; a hero image over 200 KB. Contrast is not re-measured by the script: it is guaranteed by restricting the site to the Stencil tokens whose contrast Stencil's own tests cover.

The script cannot see everything. The `site-review` skill covers what is left: responsive screenshots at 390, 768, and 1440px in both light and dark, JavaScript off, reduced motion, keyboard focus, text legibility, Lighthouse, and copy against the README and release notes.

## Changing the site

1. Read this page and `site/styles.css`'s `:root` block. Reuse a token or pattern before adding one.
2. Make the change on a `feat/` or `fix/` branch with the `site` scope.
3. `pnpm check:site`. Use `pnpm site:preview` for quick edits (landing page only, no build), then `pnpm site:serve` (the exact deploy artifact, including `/stencil/`) and look at it at three widths.
4. Run the `site-review` skill before the PR; put its evidence in the PR body.
