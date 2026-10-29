---
name: qa-checklist
description: Create visual-first Ryte QA checklists. Use when the user invokes $qa-checklist or asks what to test, needs a PR QA checklist, wants manual visual testing guidance, or wants Codex to derive QA from a Ryte diff.
---

# Ryte QA Checklist

Use this skill to produce checkboxes the user can run and report back.

## Shared Contract

- Do not read, summarize, index, or print real note content unless the user explicitly approves that exact operation.
- Keep Ryte local-first and preserve local search without provider API keys.
- Update today's session note, active PR notes, or QA artifact when a checklist is created or results are reported.
- Use checkbox tasks only: `- [ ]`.
- Prioritize visual/manual checks before console checks.
- Console checks must be pasteable JavaScript for Chrome DevTools Console and include expected results.

## Workflow

1. **Inspect Scope**
   - Read the diff, PR summary, or user-described behavior.
   - Group QA by user-visible surfaces: app shell, sidebar, viewer, search, settings, library, tabs, persistence, responsive/window behavior, errors.

2. **Write Visual Checks First**
   - Cover launch, layout, hover/selected states, focus states, resize/collapse behavior, translucency/vibrancy, empty/loading/error states, and restart persistence when affected.
   - For startup, native module, icon, packaging, or release changes, include an isolated packaged-app launch. Require an installed-DMG check before a public release.
   - Use concrete expected outcomes.

3. **Add Console Checks Only When Useful**
   - Use JavaScript only when DevTools reaches the renderer under test; do not substitute it for native-app verification.
   - Do not include shell commands.
   - Include expected values.

4. **Support Result Review**
   - When the user returns checked items or screenshots, map failures to likely code areas and recommend fixes.
   - Record pass/fail summary in today's notes or the PR QA artifact when useful.

## Console Check Format

````markdown
- [ ] In Chrome DevTools Console, run:
  ```js
  document.querySelector('.sidebar-chrome-btn')?.getAttribute('aria-pressed')
  ```
  Expected: `"true"` when the sidebar is hidden and `"false"` when visible.
````

## Output Shape

```markdown
Manual QA:
- [ ] Launch Ryte and confirm ...
- [ ] Hover ... and confirm ...
- [ ] Restart Ryte and confirm ...
```
