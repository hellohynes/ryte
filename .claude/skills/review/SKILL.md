---
name: review
description: Review Ryte work as a Staff Software Engineer. Use when the user invokes $review or asks for a counter-review, hardening pass, PR readiness review, gap analysis, resilience review, performance review, or implementation critique.
---

# Ryte Review

Use this skill to find concrete risks before Ryte work ships.

## Shared Contract

- Do not edit repo files on `main` or `master`.
- Do not read, summarize, index, or print real note content unless the user explicitly approves that exact operation.
- Keep Ryte local-first and preserve local search without provider API keys.
- Respect boundaries: main owns filesystem, SQLite/vector storage, providers, credentials, external links, and OS integration; renderer calls typed preload APIs.
- Update today's session note and any active frame, shaping, breadboard, plan, QA, or PR artifact when findings change status, scope, validation, or next steps.
- Put local planning artifacts under `${RYTE_SESSION_NOTES_ROOT:-$HOME/notes/sessions}/YYYY-MM-DD/`.

## Review Pass

1. **Orient**
   - Run `git status -sb` and inspect the diff or target PR.
   - Read relevant implementation files, tests, and active plan artifacts.
   - Do not read unrelated real notes as evidence.

2. **Check Risk Areas**
   - Privacy: no note content leaks, logs, commits, or provider calls without opt-in.
   - Architecture: renderer does not gain direct filesystem, credential, provider, or generic IPC access.
   - Local-first: keyword/local search remains functional without API keys.
   - Persistence: writes are atomic or recoverable; corrupt state has safe fallback.
   - Optimistic UI: rollback/error paths exist.
   - Performance: hot UI paths avoid unnecessary IPC, sync writes, or reactive churn.
   - Accessibility: labels, focus, keyboard reachability, and effective states are coherent.
   - Validation: tests cover changed behavior and smoke tests use synthetic fixtures.

3. **Route Focused Evidence**
   - Use `bug-hunt` to verify a reported runtime defect.
   - Use `data-trace` for state, persistence, indexing, cache, or watcher concerns.
   - Use `perf-check` when a performance claim needs measurement.
   - Use `design-review` for changed user-visible Electron UI.
   - Use `electron-ipc-contract` for a changed trust-boundary contract.

4. **Report Findings First**
   - Lead with findings ordered by severity.
   - Include file/line references when reviewing code.
   - Separate blockers from follow-ups.
   - If no issues are found, say so and name residual risks.

5. **Update Artifacts**
   - If findings change the plan, update the active plan/review artifact or today's session note.

## Output Shape

```markdown
Findings:
- High: ...
- Medium: ...

Open questions:
- ...

Residual risk:
- ...
```
