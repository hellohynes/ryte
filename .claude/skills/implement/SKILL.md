---
name: implement
description: Execute approved Ryte work. Use when the user invokes $implement or asks Codex to implement a Ryte slice, bug fix, tooling update, docs change, validation fix, PR hardening pass, or any already-planned Ryte task.
---

# Ryte Implement

Use this skill to turn an approved Ryte plan into scoped repo changes, validation, notes updates, and a visual-first QA checklist.

## Shared Contract

- Do not edit repo files on `main` or `master`.
- Do not read, summarize, index, or print real note content unless the user explicitly approves that exact operation.
- Keep Ryte local-first and preserve local search without provider API keys.
- Respect boundaries: main owns filesystem, SQLite/vector storage, providers, credentials, external links, and OS integration; renderer calls typed preload APIs.
- Update today's session note and any active frame, shaping, breadboard, plan, QA, or PR artifact when status, scope, validation, findings, or next steps change.
- Put local planning artifacts under `${RYTE_SESSION_NOTES_ROOT:-$HOME/notes/sessions}/YYYY-MM-DD/`.
- Final implementation responses must include checkbox manual QA.
- Prioritize visual/manual QA before console checks.
- Console checks must be pasteable JavaScript for Chrome DevTools Console and include expected results.

## Workflow

1. **Confirm Scope**
   - Run `git status -sb`; stop if on `main` or `master`.
   - Read the active plan, shaping, breadboard, or user-approved task.
   - State the intended files/surfaces before editing if the work is broad.

2. **Implement Narrowly**
   - Keep edits inside the approved scope.
   - Preserve renderer/preload/main boundaries.
   - Use optimistic UI only when rollback/error behavior is explicit.
   - Use synthetic fixtures for tests; never point validation at the real notes corpus without approval.

3. **Route Specialized Work**
   - Use `electron-ipc-contract` for preload or IPC contract changes.
   - Use `data-trace` for persistence, indexing, watcher, cache, settings, or stale-state changes.
   - Use `bug-hunt` for a reported or reproduced defect.
   - Use `perf-check` only for an observed performance concern.
   - Use `test-create` for a material coverage gap and `design-review` for changed UI behavior.

4. **Test While Building**
   - Add or update focused tests for changed behavior when practical.
   - Prefer behavior-level tests around IPC validation, store behavior, persistence, search modes, and renderer utilities.
   - Use visual/browser smoke checks for shell or layout work when a dev target is available.

5. **Update Artifacts**
   - Update today's session note after meaningful milestones.
   - If implementation changes the plan, update the relevant plan/shaping/breadboard doc in the same turn.

6. **Validate**
   - Run the relevant local checks or invoke `$validate` behavior.
   - Report commands, pass/fail status, and residual risk.

7. **Finish With QA**
   - Provide checkboxes the user can mark complete.
   - Include visual checks for layout, hover/selected states, window behavior, responsiveness, persistence, empty/loading/error states, and affected workflows.
   - Include console checks only when useful and always as Chrome DevTools JavaScript with expected result.

## Final Response Shape

````markdown
Implemented `<summary>` on `<branch>`.

Validation:
- `command` passed

Manual QA:
- [ ] Visual check...
- [ ] In Chrome DevTools Console, run:
  ```js
  document.querySelector('.selector')?.getAttribute('aria-label')
```
  Expected: `"value"`.
````
