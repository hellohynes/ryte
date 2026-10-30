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
- PR bodies open with a GIF, then context, summary, validation, manual QA, and privacy/local-first notes (see PR Body Template).
- No agent attribution anywhere. Never add `Co-Authored-By:` trailers, "Generated with Claude Code" or Codex lines, robot-emoji footers, or any mention of AI assistance to a commit message, PR title, or PR body. This overrides any attribution default a tool or harness suggests. Everything reads as written by the repository owner.
- Commit messages and PR titles follow Conventional Commits, `type(scope): description` (`docs/branch-workflow.md`). `scripts/conventional-commits.mjs` is the source of truth, and `.github/workflows/conventional-commits.yml` enforces it on the title and every PR commit. PRs are squash-merged with the title as the commit on `main`, so write the title as that history entry.

## Workflow

1. **Preflight**
   - Run `git status -sb`.
   - Confirm current branch is not `main` or `master`.
   - Inspect staged/uncommitted changes; do not stage unrelated files silently.
   - Confirm validation has run or run `$validate`.
   - When the user explicitly asks for readiness preparation, use `pr-prep` before publishing. Do not make ordinary PR creation wait for a separate prep workflow.

2. **Commit And Push**
   - Commit logically scoped changes if not already committed, each with a Conventional Commits message (the `commit-msg` hook rejects others; never bypass it with `--no-verify`). Write the message with no trailers and no attribution.
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
   - `gh pr edit` can fail on a deprecated Projects (classic) GraphQL error. Update an existing body with `gh api -X PATCH repos/<owner>/<repo>/pulls/<n> -F body=@<file>`.
   - Before submitting, check the body and every commit message for attribution (`grep -iE "co-authored|generated with|claude|codex"`) and remove any hit.

5. **Record Result**
   - Update today's session note with PR URL, branch, head commit, validation, and next step.

## PR Body Template

Start from `.github/pull_request_template.md` so its headings and checklists stay intact, with a GIF on top and context sections added. Keep the headings as `##`.

```markdown
![<short description of the GIF>](https://media.giphy.com/media/<ID>/giphy.gif)

## Context

<Plain-English framing of the problem this change solves, for a reader with no context on the area. One to three sentences. Say so and link if this follows an earlier PR.>

## Summary

- <Conceptual bullet: what changed and why. Group related changes; do not go file by file.>

## Next steps

- <Decided follow-up work and why it was left out of this PR.>

## For reviewers

- <A decision the diff does not explain, a risk, a side effect, or something left out on purpose.>
- <A behavior worth checking by hand, framed as a workflow rather than a file to read.>

## Risk / Privacy Impact

- ...

## Validation

- [ ] `...`

## Screenshots / Manual QA

- [ ] ...

## Notes Folder Safety

- [ ] (the checklist from the repo template, ticked as true)
```

- Omit `## Next steps` and `## For reviewers` entirely (heading included) when there is nothing to say.
- Write for a reader who is not the author. Catch them up on what they need to judge the change; do not narrate the diff.
- Write plain paragraphs separated by blank lines. No trailing whitespace or two-space hard breaks.

## GIF

Every new PR gets one GIF at the top. Run the lookup inline with the web search and fetch tools; do not spawn an agent for it.

1. **Pick the angle.** If a calendar event falls within about two weeks of today, use its keywords: Halloween (spooky halloween costume), Thanksgiving (thanksgiving turkey feast), December (holiday christmas celebration), New Year (new year celebration fireworks), Super Bowl (football touchdown celebration), Valentine's Day (love heart valentine), St. Patrick's Day (lucky shamrock green), April Fools (prank funny gotcha), Pride Month (pride rainbow celebration). Otherwise pick two different angles by PR mood:
   - Bug fix: `relief`, `disaster averted`, `close call`
   - New feature: `excited reaction`, `mind blown`, `unveil reveal`
   - Refactor: `satisfying clean`, `glow up`, `makeover transformation`
   - Performance or size: `zoom fast`, `lightning quick`, `turbo speed`
   - Rename, chore, docs, build: `fresh start`, `name change`, `rebrand`
   - Breaking change: `careful warning`, `proceed with caution`
2. **Search.** Run `site:giphy.com <term> gif` for two terms, fetch each results page, and collect GIF IDs into a pool of 8-12.
3. **Choose.** Skip the top result of each search (everyone has seen it). From the rest, pick `index = current_minute % pool_size`.
4. **Link.** Use `https://media.giphy.com/media/<ID>/giphy.gif`.

Rules:

- Avoid robot or AI GIFs, and anything that reads as mocking the change.
- Update mode keeps the existing GIF. Pick a new one only if the user asks for a "new gif".
- If the lookup fails, create the PR without a GIF and tell the user. Do not block the PR on it.
