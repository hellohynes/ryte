---
name: site-review
description: Review a change to the Ryte website for design quality, accessibility, performance, and honest copy before a PR. Use after editing anything in site/ or the site build, or when asked whether the site still meets its design bar.
---

# Site Review

Review the built site, not only the diff. The rules are in `docs/site-design.md`.

## Workflow

1. Run `pnpm check:site`, `pnpm stencil:tokens --check`, and `pnpm stencil:icons --check`. A failure is a finding.
2. Build and serve: `pnpm site:serve` (assembles `site-dist/` with the gallery at `/stencil/` and serves http://localhost:6001). Open `/` and `/stencil/`.
3. Capture screenshots at 390, 768, and 1440px in both light and dark (emulate `prefers-color-scheme`), at the top of the page and after scrolling through every section. Confirm the hero screenshot matches the theme and still matches the current app. Look for: horizontal scroll (`document.documentElement.scrollWidth` equals `clientWidth`), clipped or overflowing text, orphaned words in headlines, uneven section rhythm, an icon or image out of weight with its neighbors, and any element that is not on the shared gutter.
4. Check the states: JavaScript off (the headline, copy, and download are visible; nothing stays hidden), reduced motion on (no fade), keyboard only (visible focus on every link and button, a sensible tab order, and every in-page link such as Installation help landing on a visible section), and the hover and focus of the primary button and cards.
5. Check legibility in both themes: the hero text and the download note must stay readable. `check:site` restricts the page to Stencil colors whose contrast Stencil tests, so a new surface or image behind text is the case to inspect.
6. Run Lighthouse on `/` (mobile profile) with the Chrome DevTools tooling. Targets: accessibility 100, best practices 100, performance 95 or more, no layout shift, LCP under 2.5s.
7. Check copy against the README, the app, and the latest release notes. Every claim must be true of the shipped build. Flag any new imagery that was not made from the real app.
8. Adjudicate findings as fix, defer, dismiss, or needs decision, with evidence. Do not redesign beyond the change under review.

## Output

Report readiness, with the screenshots reviewed (widths), the `check:site` and Lighthouse results, findings by severity, and the smallest follow-up.
