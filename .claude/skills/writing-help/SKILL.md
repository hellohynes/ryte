---
name: writing-help
description: Tighten agent-authored Ryte build artifacts into clear, direct prose while preserving product and technical meaning. Use when drafting or revising UI copy, documentation, plans, reports, changelogs, or pull-request text during development.
---

# Ryte Writing Help

Improve writing created for Ryte development without touching user content.

## Scope

Use this skill only for agent-authored build artifacts: product/UI copy, repository documentation,
plans, reports, changelogs, release notes, and pull-request text.

Never apply it to user notes, imported Markdown, search queries, search results, provider output, or
other content from the user's notes corpus. A user-provided draft is detect-only unless they explicitly
ask for it to be rewritten.

## Workflow

1. Identify the reader, the artifact's job, and every fact, decision, identifier, command, and safety constraint that must survive.
2. Read [the editing patterns](references/patterns.md). Treat them as evidence for a focused edit, not a style score or a claim about the original writer.
3. Lead with the point; prefer concrete actors and actions; keep precise technical terms consistent. Make the minimum effective change.
4. Preserve contract language, negative constraints, uncertainty, paths, commands, citations, version numbers, and source-backed facts.
5. For repository artifacts, follow the nearest documentation rules and run the affected validation. Do not add roadmap promises or unsupported behavior.

## Output

For an audit, report the exact pattern, a short example, why it weakens the artifact, and the smallest correction. For an edit, report the revised artifact and what changed.

## Attribution

The editing-pattern reference is adapted from Peter Yang's `no-ai-slop` skill under the included MIT license.
