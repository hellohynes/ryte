---
name: pr-create
description: Create or update Ryte pull requests. Use when the user invokes $pr-create or asks to create a PR, open a PR, publish a Ryte branch, prepare work for review, or update an existing Ryte PR.
---

# Ryte PR Create

Use this skill to publish a Ryte branch without duplicate PRs.

## Shared Contract

- Do not edit repo files on `main` or `master`.
- Do not commit API keys, `.env`, local databases, note contents, generated note artifacts, build output, or dependency folders.
- Update today's session note and any active PR/plan artifact with branch, commit, PR URL, validation, and manual QA expectations.
- Ryte PRs are non-draft by default unless the user asks for draft.
- PR bodies should include summary, validation, manual QA, and privacy/local-first notes when relevant.
- Commit messages and PR titles follow Conventional Commits, `type(scope): description` (`docs/branch-workflow.md`). `scripts/conventional-commits.mjs` is the source of truth, and `.github/workflows/conventional-commits.yml` enforces it on the title and every PR commit. PRs are squash-merged with the title as the commit on `main`, so write the title as that history entry.

## Workflow

1. **Preflight**
   - Run `git status -sb`.
   - Confirm current branch is not `main` or `master`.
   - Inspect staged/uncommitted changes; do not stage unrelated files silently.
   - Confirm validation has run or run `$validate`.
   - When the user explicitly asks for readiness preparation, use `pr-prep` before publishing. Do not make ordinary PR creation wait for a separate prep workflow.

2. **Commit And Push**
   - Commit logically scoped changes if not already committed, each with a Conventional Commits message (the `commit-msg` hook rejects others; never bypass it with `--no-verify`).
   - Check every branch commit and the final PR title before pushing: `node scripts/conventional-commits.mjs --title "<title>"` (exit 0 means valid; it prints a corrected title when the fix is mechanical).
   - Push the branch. If sandbox DNS blocks GitHub, rerun push with escalation.

3. **Avoid Duplicate PRs**
   - Search GitHub for an existing PR with the current head branch before creating one.
   - If a PR exists, report it and update/comment only if tooling permissions allow.

4. **Create PR**
   - Prefer the GitHub connector when available.
   - Use `gh` only when authenticated and needed as fallback.
   - If GitHub connector comments or updates fail with `403 Resource not accessible by integration`, report the limitation clearly.
   - If `gh auth status` shows an invalid token, do not rely on `gh` until re-authenticated.

5. **Record Result**
   - Update today's session note with PR URL, branch, head commit, validation, and next step.

## PR Body Template

```markdown
## Summary
- ...

## Validation
- `...`

## Manual QA
- [ ] ...

## Privacy / Local-first
- ...
```
