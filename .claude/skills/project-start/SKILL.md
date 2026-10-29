---
name: project-start
description: Start a Ryte effort safely. Use when the user invokes $project-start or asks to start a new Ryte task, phase, slice, spike, tooling update, bug fix, release/tag task, PR cleanup, or post-merge next effort.
---

# Ryte Project Start

Use this skill to orient a Ryte effort before implementation or planning edits begin.

## Shared Contract

- Do not edit repo files on `main` or `master`.
- Do not read, summarize, index, or print real note content unless the user explicitly approves that exact operation.
- Keep Ryte local-first and preserve local search without provider API keys.
- Respect boundaries: main owns filesystem, SQLite/vector storage, providers, credentials, external links, and OS integration; renderer calls typed preload APIs.
- Update today's session note and any active frame, shaping, breadboard, plan, QA, or PR artifact when status, scope, validation, findings, or next steps change.
- Put local planning artifacts under `${RYTE_SESSION_NOTES_ROOT:-$HOME/notes/sessions}/YYYY-MM-DD/`.
- If a final response includes manual QA, use checkboxes and prioritize visual/manual checks before console checks.
- Console checks must be pasteable JavaScript for Chrome DevTools Console and include expected results.

## Workflow

1. **Sync Context**
   - Run `git status -sb` and identify the current branch.
   - Resolve the ordinary base from the remote symbolic default when available; use the documented local base only when that resolution is unambiguous. Do not assume `main` or `origin`.
   - If the user says a PR merged, use `pr-complete` rather than manually switching branches or deleting refs here.
   - Confirm a clean worktree and that the current branch is the resolved base before creating a new branch. Stop and ask before carrying changes forward or branching from another feature.

2. **Create Work Branch**
   - If repo edits are likely, create a branch before edits.
   - Refresh the resolved base with `git pull --ff-only <remote> <base>` before branching when a remote is available. Stop on any fetch or fast-forward failure; never replace it with a merge, rebase, or reset.
   - Use `<type>/<short-purpose>` (lowercase kebab-case, with a Conventional Commits type such as `feat`, `fix`, or `chore`; see `docs/branch-workflow.md`) unless the user provides a branch name.
   - If the user only requested notes outside the repo, a branch is optional unless repo edits follow.

3. **Gather Source Artifacts**
   - Read `AGENTS.md`.
   - Read the relevant local skill docs, active session note, and current frame/shaping/breadboard/plan docs.
   - Do not inspect unrelated real note content.

4. **Classify Effort**
   - Name the effort type: planning, implementation, validation, QA, PR creation, PR completion, release/tag, spike, or tooling update.
   - Identify intended scope, likely validation, and whether daily notes or plan docs need updates.

5. **Record Start**
   - Create today's session folder if needed.
   - Add a started entry with branch, goal, source artifacts, plan path if present, and immediate next step.
   - If the user asks for a durable plan, write it to today's `plan/` folder.

6. **Report Start Plan**
   - State the resolved base/remote, branch, goal, active artifacts, and the next 3-6 execution steps.
   - Do not ask to proceed unless a high-impact product choice remains unresolved.

## Output Shape

```markdown
Started Ryte effort on `<branch>`.

Goal: ...
Source artifacts: ...
Next steps:

- ...
```
