# Changelog

All notable Ryte changes should be recorded here before a tagged release.

Ryte uses SemVer while it is pre-1.0. The app version in `app/package.json` is the source of truth for packaged builds, Git tags, and future DMG filenames.

## 0.5.1

### Highlights

- Fixes the "Ryte is damaged" warning some Apple Silicon Macs showed for 0.5.0. Packages are now ad-hoc signed and the app bundle's signature is verified before packaging succeeds, replacing disabled signing that could leave Ryte with an invalid signature.
- Disables hardened runtime for ad-hoc packages to prevent a Team ID mismatch when loading Electron Framework; it stays on for Developer ID builds. PR CI now exercises the packaged native launch.
- Documents checksum verification and a targeted first-launch recovery for macOS's "Ryte is damaged" warning. Downloads still lack Apple notarization.
- Moves the app onto the Stencil design system: semantic design tokens for light and dark, a custom outlined icon set, and shared dialog, menu, popover, tooltip, toast, and disclosure behavior with consistent Escape, focus-return, and keyboard handling, checked by real-Chromium keyboard contract tests. Renderer only; no changes to storage, indexing, or search behavior.

### Validation

- `pnpm --dir app validate`
- `pnpm --dir app smoke:indexer` (synthetic fixtures)
- `pnpm dmg:local` (ad-hoc signed Apple Silicon package)

## 0.5.0

### Highlights

- Replaces Settings with an autosaving Preferences modal organized into Content, AI Tools, and Appearance, with retry controls for failed saves.
- Adds System, Light, and Dark color modes across the app and fifteen bundled fonts for notes, code, and summaries.
- Rebuilds search around a summary and cited sources, with a research trace, collapsible sections, progress timelines, and copy controls.
- Restores saved summaries immediately and keeps the previous summary visible while an updated answer is prepared.
- Improves indexing recovery and fills missing embeddings when semantic search becomes available, while keeping keyword search available without API keys.
- Persists refreshed OpenAI model lists, improves model compatibility, and adds direct links to supported ticket and pull-request references.
- Includes the Apple Silicon sqlite-vec native library in the installer and checks packaged SQLite, vector search, and keyword search before packaging succeeds.

### Validation

- `pnpm --dir app validate`
- `pnpm --dir app smoke:indexer` (synthetic fixtures)
- `pnpm dmg:local` (unsigned Apple Silicon package)

## 0.3.0

### Highlights

- Adds explicit Auto, Keyword, and Hybrid local retrieval modes.
- Keeps keyword retrieval available without embeddings, API keys, or network access.
- Adds clickable local search results with source previews and retrieval metadata.
- Adds a local-only answer mode that skips provider settings and secret reads.
- Adds index transparency with last-indexed state and a clear-and-rebuild recovery control.
- Keeps source previews out of persisted search history.
- Carries forward Phase 1 privacy controls for semantic indexing, cloud answers, provider keys, IPC validation, and rendered markdown safety.

### Validation

- `pnpm validate`
- `pnpm smoke:indexer`

## Versioning Policy

- `0.1.x` is reserved for Phase 0 foundation fixes.
- `0.2.x` is reserved for the first Phase 1 security and privacy UX milestone.
- `0.3.x` is reserved for the first Phase 2 local-first search milestone.
- `0.4.x` is reserved for the first downloadable macOS release.
- `0.5.x` is reserved for the redesigned Preferences and search experiences.
- Git tags use a leading `v`, for example `v0.1.0`.
- macOS build numbers should be monotonically increasing integers once packaged distribution starts.
