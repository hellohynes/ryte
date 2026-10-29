# Ryte Agent Guide

Ryte is a local-first macOS Electron app for browsing, indexing, and searching a user's markdown notes. Treat the notes corpus as private user data.

## Non-Negotiable Safety Rules

1. Do not edit files or commit on `main` or `master`. Create a feature branch before making project changes.
2. Do not read, index, print, summarize, or commit real user note content unless the user explicitly asks for that specific operation.
3. Do not commit API keys, `.env` files, local databases, note contents, generated note artifacts, build output, or dependency folders.
4. Keep local search functional without provider API keys.
5. Treat rendered markdown, links, and model output as untrusted input.

## Architecture Boundaries

- Main process owns filesystem access, SQLite/vector storage, provider calls, credentials, and external link handling.
- Renderer is UI only. It should call the typed preload API and should not gain direct Node filesystem access.
- Preload should expose narrow, typed operations. Avoid generic IPC passthroughs.
- Secrets are encrypted through Electron `safeStorage`; plaintext keys should never be written to disk or logs.

## Validation

Run validation from `app/` unless noted otherwise:

```bash
pnpm guard:branch
pnpm validate
pnpm smoke:indexer
```

`pnpm validate` runs Node version validation, lint, typecheck, tests, and production build. `pnpm smoke:indexer` is the explicit native SQLite/indexer smoke using synthetic fixtures.

The individual validation commands are:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

If a validation command cannot be run, report why and what risk remains.

## Notes Privacy

The user's notes folder may contain personal agent artifacts and sensitive content. Do not run scripts against the real notes corpus by default. Any smoke or fixture validation must use synthetic fixtures unless the user explicitly approves a real-notes run.

## Implementation Style

- Prefer focused, reviewable changes over broad refactors.
- Renderer UI uses Stencil, the design system in `app/src/renderer/src/stencil/` (components, `--st-*` tokens, icons). Follow the `stencil-usage` skill and read `stencil/manifest.json`; `pnpm check:stencil` and `pnpm test:stencil` enforce it.
- The website (`site/`) follows `docs/site-design.md` and the `site-design` skill; run the `site-review` skill before a site PR. `pnpm check:site` enforces its rules.
- Keep Electron security hardening in the main process where possible.
- Keep provider-specific code behind provider interfaces or registries.
- Update docs or progress notes when implementation decisions change the plan.
- Name branches `<type>/<short-purpose>` and write commit messages and PR titles as Conventional Commits, `type(scope): description` (`docs/branch-workflow.md`). The `commit-msg` hook and CI enforce it; don't bypass the hook with `--no-verify`.
