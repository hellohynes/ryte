---
name: pr-prep
description: Prepare a Ryte branch for review with scoped evidence, focused Electron checks, and final validation. Use when asked whether a branch is ready, to harden a PR, or to prepare before invoking pr-create.
---

# Ryte PR Prep

Produce readiness evidence before publishing, without broad rewrites or automatic external actions.

## Modes

- Author: inspect the current branch, apply only explicitly authorized in-scope fixes, and rerun affected checks.
- Report-only: assess readiness without edits, commits, pushes, PR changes, or external mutation.

## Workflow

1. Resolve the remote-qualified base rather than assuming `main` or `origin`. Capture its SHA, the current head SHA, committed scope, staged/unstaged/untracked working-tree scope, user restrictions, and existing validation evidence.
2. Classify changed paths: renderer/UI, IPC/preload, main services, persistence/indexing, native packaging, workflow, documentation, or tests.
3. Run `review` and only the focused skill triggered by the diff: `electron-ipc-contract`, `data-trace`, `perf-check`, `design-review`, `workflow-edit`, or `test-create`.
4. Adjudicate findings as fix, defer, dismiss, or needs decision with concrete evidence. Do not silently expand scope.
5. Run the final scope-appropriate checks from `validate`. Require synthetic fixtures and packaged-app evidence where the change affects startup, native modules, or distribution. Check that every branch commit and the planned PR title pass `scripts/conventional-commits.mjs` (the same check CI runs); a failing header is `Needs fixes`.
6. If a fix, commit, rebase, or base advance changes the reviewed scope, recapture the affected evidence and rerun the related review and validation before reporting readiness.
7. Report `Ready`, `Needs fixes`, or `Needs decision` with the final base/head evidence and residual risk.

## Boundaries

Do not commit, push, create a PR, reply to review comments, or publish a release unless separately requested.
