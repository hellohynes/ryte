---
name: site-design
description: Change the Ryte website (site/) in its clean, high-touch style on Stencil. Use for any edit to the landing page copy, layout, styling, sections, icons, or imagery, and when adding a site page or section.
---

# Site Design

Keep the website at the Apple, Stripe, and Ramp bar: restrained, spacious, specific, and fast. The rules live in `docs/site-design.md`; read it first.

## Workflow

1. Read `docs/site-design.md` and the `:root` block of `site/styles.css`. Decide whether the change fits an existing section pattern or needs a new one. A new section is one idea: a headline of eight words or fewer, one supporting sentence, at most one visual.
2. Build with Stencil tokens only, through `site/stencil-tokens.css`: `--st-space-*`, `--st-block-*`, `--st-layout-*`, `--st-type-*`, `--st-border-*`, `--st-radius-*`, and the semantic colors `--st-color-*` (the page follows the system light or dark theme; type is self-hosted Geist). There are no site-only colors. Never edit the generated `stencil-tokens.css` or `stencil-icons.svg`; regenerate with `pnpm stencil:tokens` and `pnpm stencil:icons`. To use another Stencil icon, add it to `SITE_ICONS` in `app/scripts/generate-stencil-icons.ts`.
3. Keep one accent (Ryte blue) for feature icons and links; the primary action is Stencil's primary button. Check every change in both themes. Keep depth to shadow and ring tokens and hairlines. Keep motion to the single fade-up (`.reveal`); stop everything for reduced motion; keep content visible without JavaScript.
4. Write copy that is specific and true of the shipped build (direction may lead, but label anything unshipped "in development" and say what ships today): plain nouns and verbs, no adjectives that need proof, honest limits (unsigned build, Apple Silicon). Check each claim against the README, the app, and the release notes. Do not show product imagery that was not made from the real app with synthetic notes, and never imply AI summaries in a screenshot without a real provider run. After a visible app change, recapture the hero with `pnpm site:screenshots` (it uses the synthetic notes in `scripts/site-screenshots/notes` and writes the dark and light images).
5. Run `pnpm check:site` from the repo root or `app/`, then look at 390, 768, and 1440px: `pnpm site:preview` serves the landing page instantly while you edit, and `pnpm site:serve` builds and serves the exact deploy artifact, gallery included, on http://localhost:6001.
6. Before a PR, run the `site-review` skill and put its evidence in the PR body.

## Output

Report what changed, which rule or pattern it follows, the `check:site` result, and the widths and states you looked at.
