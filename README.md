# ryte

Local macOS app for searching and browsing a user-selected markdown folder — a personal knowledge base over your own files.

## What it does

- **Indexes** your notes corpus into a local SQLite database with keyword search by default
- **Searches locally** in Auto, Keyword, or Hybrid retrieval modes; keyword mode works offline
- **Optionally adds semantic search** using OpenAI embeddings when explicitly enabled in Preferences (AI Tools); turning it on gives existing notes embeddings the next time they are indexed, and any note whose embedding failed is retried then
- **Optionally generates answers** using a configured OpenAI or Anthropic model. An answer is a short TL;DR followed by collapsible sections, one per area the notes cover, and newer notes carry more weight than older ones. When the question asks about a plan, timeline, progress or next steps, a Done / In Progress / Backlog timeline comes between the TL;DR and the sections, with consecutive Backlog steps listed under one node. Tickets and pull requests a note gives as a full web address (a GitHub pull request or issue, or an Atlassian Cloud ticket) are copied into the timeline as written and open in your browser; a bare key or number such as `PR #123` shows as plain text.
- **Browses** your notes in a file tree sidebar with clean markdown rendering and syntax-highlighted code blocks
- **Manages files** from sidebar and tab context menus with copy, inline rename, Finder, path, close, and confirmed Trash actions
- **Adapts** to light or dark mode (System, Light or Dark) and a font for your notes, summaries and code (the rest of the interface stays in Geist), both set in Preferences > Appearance. Geist is the default; every font ships inside the app, so nothing loads over the network, and their licences are in `app/resources/font-licenses.txt`
- **Watches** for file changes and updates the file tree, viewer, and local index incrementally

## Requirements

- macOS
- Apple Silicon (M-series) Mac for the downloadable DMG
- Node.js 24.x
- pnpm 10.12+
- API keys are optional. Local keyword search works without network access.

## Getting started

```bash
cd app
nvm use # reads the repository's .nvmrc
pnpm install
pnpm dev
```

On first launch, the Preferences modal opens. It has three sections, **Content**, **AI Tools** and **Appearance**, and every control saves as you change it; if a save fails, a notice at the bottom of the window says why and offers **Retry**. Choose a notes root (`~/Documents/Ryte` by default) under Content and optionally add API keys under AI Tools for semantic search and generated answers; with more than one key saved, a select picks which vendor writes summaries. ryte will index your corpus and show the file tree once complete.

Search history is stored locally in the renderer process using `localStorage` and can be cleared from the search overlay or Preferences (Content). It stores queries only by default. Generated answers and citations are kept by default for new installs and can be turned off under Content; installs that already chose a value keep it. Source previews are not persisted. Each query has one history row, and repeating it moves that row to the top. Opening a row with a saved answer restores its summary and cited sources without a provider request, then checks the local index; a notice offers **Update summary** only when changed or newly indexed files could affect it, and the old summary stays on screen, dimmed, until the new one starts writing. Provider keys are encrypted through Electron `safeStorage` before they are written to app settings.

## Stack

- **Electron 41.6.1** — main process owns all file I/O, native modules, IPC
- **Vue 3 + Pinia** — renderer UI and state
- **better-sqlite3 + sqlite-vec** — local vector index
- **markdown-it + shiki** — markdown rendering with syntax highlighting (JS regex engine, no WASM)
- **chokidar** — file watching for live re-render and incremental re-indexing
- **OpenAI** — `text-embedding-3-small` for embeddings
- **Anthropic** — optional generated answers

## Development

From the repository root:

```bash
nvm use # switches only this shell to the repository's Node 24
corepack enable # once per Node installation; pnpm versions remain project-scoped
pnpm build:local # production build only
pnpm dmg:local   # ad-hoc signed (not notarized) Apple Silicon DMG for local installer checks; removes the unpacked staging app
pnpm qa:local    # validate, smoke the indexer, then launch the built app
pnpm stencil     # serve the Stencil gallery on http://localhost:6002
pnpm site:preview # serve the landing page (site/) instantly on http://localhost:6001; /stencil/ forwards to the gallery when pnpm site:stencil is running
pnpm site:stencil # the Stencil gallery with hot reload on http://localhost:6002 (same as pnpm stencil)
pnpm site:serve   # build the exact deploy artifact (landing page plus /stencil/) and serve it on http://localhost:6001
```

Or run individual commands from `app`:

```bash
cd app
nvm use # reads the repository's .nvmrc
pnpm check:node
pnpm validate      # full local validation: node, Stencil checks, lint, typecheck, test, build
pnpm qa:local      # validate, smoke the indexer, then launch the built app
pnpm launch -- --user-data-dir=/tmp/ryte-profile # launch an existing production build with optional Electron flags
pnpm dev          # start with hot-reload (macOS: runs a Ryte-named copy of Electron, see below)
pnpm test         # unit tests (vitest)
pnpm typecheck    # tsc + vue-tsc
pnpm lint         # eslint
pnpm build        # production build
pnpm smoke:indexer # safe native SQLite/indexer smoke using synthetic notes
pnpm stencil:tokens # regenerate Stencil's scale and color tokens (`--check` verifies the committed files)
pnpm stencil      # serve the Stencil gallery on http://localhost:6002
pnpm stencil:icons # regenerate the outlined icon set (`--check` verifies it)
pnpm stencil:manifest # regenerate stencil/manifest.json, the component API agents read (`--check` verifies it)
pnpm check:stencil # flag hard-coded colors and px, raw dialogs and popovers, and components missing a gallery entry or keyboard contract
pnpm test:stencil  # run the keyboard contracts in real Chromium (builds the gallery, drives it in Electron)
```

On macOS, `pnpm dev` and `pnpm launch` run a copy of the Electron bundle with the Ryte name and icon (bundle id `com.joshuahynes.ryte.dev`), so notifications and the Dock look like an installed build. The copy lives in `app/.dev-electron/`, is rebuilt when Electron or `build/icon.icns` changes, and the first notification asks for permission under that id.

Branch and PR expectations are documented in [docs/branch-workflow.md](docs/branch-workflow.md). Phase 0 manual app smoke is tracked in [docs/phase-0-manual-smoke.md](docs/phase-0-manual-smoke.md).

### Website

The landing page lives in `site/` and deploys to GitHub Pages from `main`. `pnpm site:build` (root) assembles `site-dist/`: the landing page plus the Stencil gallery built at `/stencil/`. The deploy workflow runs the same assembly, and CI runs it on every PR, so a broken gallery or site build fails before it ships. The hero screenshots are real captures of the app on synthetic notes; after a visible app change run `pnpm site:screenshots` (after `pnpm build:local`) to refresh them. Local previews use port 6001 (the site) and 6002 (the gallery); open `http://localhost:<port>`, and `http://127.0.0.1:<port>` works as a backup. Port 6000 is skipped on purpose: Chromium-based browsers refuse it (`ERR_UNSAFE_PORT`). For quick edits use `pnpm site:preview` (landing page only, no build); before a PR use `pnpm site:serve`, which serves the built artifact including `/stencil/`.

### Agent tooling

Ryte's canonical agent skills live in `.agents/skills/`. The matching `.claude/skills/` tree is generated and tracked for Claude compatibility; do not edit it directly.

```bash
pnpm sync:claude-skills # regenerate Claude adapters after changing canonical skills
pnpm check:skills       # verify skill names, descriptions, metadata, adapters, and manifest hashes
```

The repository intentionally has no tracked Claude hook or local-settings configuration. Keep personal `.claude/settings.local.json` settings local and uncommitted.

Runtime/tooling versions:

- Node.js: `.node-version` pins major version `24`; current validated local version is `v24.14.1`.
- pnpm: `app/package.json` pins `pnpm@10.12.1`.
- Electron: `41.6.1`.

### Electron launch troubleshooting

If `pnpm qa:local` reports that Electron exited from `SIGABRT`, the Electron process stopped before Ryte could start. Retry from a regular macOS Terminal session; if it persists after a macOS crash or restart, log out and back in (or restart macOS) before retrying.

## Versioning

`app/package.json` is the source of truth for the app version. Ryte follows [Semantic Versioning](https://semver.org): while the version is `0.y.z`, a minor bump adds features or changes behavior and a patch bump is a fix. See the Versioning Policy in [CHANGELOG.md](CHANGELOG.md).

Tagged releases use the `v` prefix, for example `v0.1.0`. GitHub Releases publish an Apple Silicon DMG named `ryte-<version>-arm64.dmg`, signed with an Apple Developer ID and notarized by Apple, with a SHA-256 checksum. See [the macOS release guide](docs/releasing-macos.md) for publishing instructions.

## Architecture

All storage and native modules live in the **main process**. The renderer communicates exclusively via typed IPC channels (`window.ryte.*`) exposed through a contextBridge preload. Secrets are encrypted via macOS Keychain (`safeStorage`); plaintext keys never touch disk.

Development planning docs may be kept in dated notes folders when requested.
