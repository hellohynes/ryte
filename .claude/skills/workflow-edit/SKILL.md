---
name: workflow-edit
description: Safely edit Ryte GitHub Actions workflows with YAML, permissions, secret, and event-input checks. Use for changes under .github/workflows or release automation.
---

# Ryte Workflow Edit

Change workflow behavior without weakening release or repository security.

## Workflow

1. Read the full workflow and identify triggers, permissions, environments, secrets, artifacts, and changed `run` blocks.
2. Treat pull-request titles, bodies, comments, branch names, commit messages, and issue fields as untrusted. Pass them through environment variables; never interpolate them directly into shell commands.
3. Keep release credentials only in GitHub secrets or temporary runner files. Do not print, commit, or persist them.
4. Use least-privilege job permissions and an environment gate for publishing or notarized release work.
5. Validate YAML with an installed parser or linter, review expression use manually, and describe the smallest safe trigger to verify the workflow after publication.

## Output

Report changed trigger/permission/secret behavior, validation, unverified hosted-run risk, and any required operator action.
