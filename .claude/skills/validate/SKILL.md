---
name: validate
description: Validate Ryte work safely. Use when the user invokes $validate or asks to run validation, smoke tests, pre-PR checks, readiness checks, branch guards, or synthetic indexer smoke for Ryte.
---

# Ryte Validate

Use this skill to run repeatable Ryte validation without touching the user's real notes corpus.

## Shared Contract

- Do not edit repo files on `main` or `master`.
- Do not read, summarize, index, or print real note content unless the user explicitly approves that exact operation.
- Keep Ryte local-first and preserve local search without provider API keys.
- Update today's session note and any active validation/plan/PR artifact with commands, pass/fail status, environment notes, and residual risk.
- Validation must use synthetic fixtures unless the user explicitly approves a real-notes run.

## Standard Commands

Run from `app/` unless noted otherwise:

```bash
pnpm guard:branch
pnpm validate
pnpm smoke:indexer
git diff --check
```

## Workflow

1. **Preflight**
   - Run `git status -sb`.
   - Confirm the branch is not `main` or `master` if repo edits are present.
   - Confirm the active Node version satisfies `.node-version` and `app/package.json` before running checks.

2. **Run Checks**
   - Run `pnpm guard:branch`.
   - Run `pnpm validate`.
   - Run `pnpm smoke:indexer`; this is the explicit native SQLite/indexer smoke with synthetic fixtures.
   - Run `git diff --check` from the repo root.
   - When the changed scope includes Electron Builder, native dependencies, startup, release workflows, or icon assets, also run `pnpm dmg:local` and report that it is an unsigned local package check.

3. **Known Failure Handling**
   - If `pnpm smoke:indexer` passes the synthetic smoke but fails during Electron rebuild due `~/.electron-gyp`, rerun with escalation because native rebuild writes outside the sandbox.
   - If a command cannot run, report why and the remaining risk.
   - Never substitute a real-notes smoke test without explicit user approval.

4. **Record Results**
   - Update today's session note or validation artifact with exact commands and results.
   - Mention residual risk, especially skipped checks or sandbox-driven reruns.

## Output Shape

```markdown
Validation:
- [x] `pnpm guard:branch` passed
- [x] `pnpm validate` passed
- [x] `pnpm smoke:indexer` passed with synthetic fixtures
- [x] `git diff --check` passed

Residual risk:
- None / ...
```
