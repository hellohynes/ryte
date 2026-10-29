# Branch Workflow

Ryte uses a lightweight PR workflow even for personal development. The goal is to keep local-first privacy and validation checks visible before code lands on `main`.

## Default Flow

1. Start from `main`.
2. Create a branch named `<type>/<short-purpose>` before editing project files.
3. Keep commits focused by concern, each with a [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) message.
4. Run validation from `app/`.
5. Push the branch and open a PR against `main`.
6. Use the PR template to record validation, privacy impact, and manual smoke.
7. Merge only after CI and any required manual checks are recorded.

## Required Local Checks

```bash
cd app
pnpm guard:branch
pnpm validate
pnpm smoke:indexer
```

`pnpm smoke:indexer` uses synthetic notes and should not touch a real notes folder by default.

To run the full local check and then launch the built app for manual smoke testing:

```bash
cd app
pnpm qa:local
```

## Branch Names

Use `<type>/<short-purpose>` in lowercase kebab-case, with a type from the list below: `feat/stencil-foundation`, `fix/watcher-after-sleep`, `chore/conventional-commits`. Agents follow the same pattern unless you name the branch yourself.

## Commits and PR Titles

Commit messages and PR titles follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), the same convention as the design repo without its Jira segment. PRs are squash-merged with the PR title as the commit on `main`, so the title is what history shows.

```text
type(scope): description
type(scope, scope): description
type(scope)!: description        breaking change
```

- **Types:** `feat`, `fix`, `perf`, `refactor`, `revert`, `build`, `chore`, `ci`, `docs`, `style`, `test`. Use `fix`, not `bug`.
- **Scopes** (optional but encouraged; list several with commas):

  | Scope      | Covers                                                                              |
  | ---------- | ----------------------------------------------------------------------------------- |
  | `app`      | App-wide changes no narrower scope fits: build config, packaging setup under `app/` |
  | `main`     | The Electron main process                                                           |
  | `renderer` | The UI                                                                              |
  | `preload`  | The preload API and IPC contract                                                    |
  | `stencil`  | Stencil, Ryte's design system: tokens, behaviors, components, gallery, agent checks |
  | `search`   | Search, summaries, and answers                                                      |
  | `indexer`  | Indexing, the watcher, SQLite and vector storage                                    |
  | `site`     | The landing page in `site/` and its Pages build                                     |
  | `release`  | Versioning, the changelog, release workflows, DMG packaging                         |
  | `agents`   | Agent skills in `.agents/` and `.claude/`                                           |
  | `deps`     | Dependency updates                                                                  |
  | `repo`     | Root config, CI, docs, and scripts                                                  |

  When a slice introduces a new area (for example `mcp`), add the scope to `scripts/conventional-commits.mjs` and this table in the same change.

- Add `!` before the colon for a breaking change. While Ryte is pre-1.0, a breaking change bumps the minor version.
- Start the description with a lowercase letter (later words keep their normal capitalization), don't end with a period, and keep the header to 100 characters or fewer.
- A commit body goes after one blank line. Messages git writes itself (`Merge …`, `Revert "…"`, `fixup!`, `squash!`) are exempt.

Examples:

- `feat(search): add citation landing`
- `fix(main, renderer): keep the watcher alive after sleep`
- `chore(repo): adopt conventional commits`

**Enforcement:** `scripts/conventional-commits.mjs` is the source of truth.

- **CI** (`.github/workflows/conventional-commits.yml`) checks the PR title and every commit in the PR, and its job summary explains any failure, with a corrected header when the fix is mechanical.
- **Locally**, the `commit-msg` hook in `.githooks/` rejects a bad message before the commit is made. It's installed by `pnpm install` in `app/`, or by `pnpm hooks:install` from the repository root.
- **Check a title by hand:** `pnpm check:pr-title "feat(search): add citation landing"`.

## Branch Rules

- Do not edit or commit project files on `main` or `master`.
- Do not commit real note content, API keys, `.env` files, local SQLite databases, build output, or dependency folders.
- Keep local keyword search working without provider keys.
- Record manual app smoke results when UI, search, settings, indexing, provider, or restart behavior changes.

## PR Scope Guidance

Keep PRs focused by milestone or user-visible capability unless the GitHub diff becomes too hard to review. Structure commits by concern so a single PR can still be reviewed commit-by-commit.
