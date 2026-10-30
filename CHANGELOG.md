# Changelog

All notable Ryte changes should be recorded here before a tagged release.

Ryte follows [Semantic Versioning](https://semver.org). The app version in `app/package.json` is the source of truth for packaged builds, Git tags, and DMG filenames. See the [Versioning Policy](#versioning-policy).

## 0.1.0

### Highlights

- First release from the restarted repository. The DMG is signed with an Apple Developer ID and notarized by Apple, so macOS opens it without the "damaged" or "unidentified developer" warnings.
- Includes everything from the earlier 0.5.1 build: the Stencil design system, the Preferences and search experiences, local keyword search without API keys, and the packaged native search check.
- Versioning restarts at 0.1.0 under standard SemVer. The releases below were numbered by project phase in the previous repository and are kept for history.

### Validation

- `pnpm --dir app validate`
- `pnpm --dir app smoke:indexer` (synthetic fixtures)
- `pnpm --dir app release:mac:arm64` (signed and notarized Apple Silicon package, verified with `scripts/verify-mac-release.mjs`)

## 0.5.1 (earlier numbering)

### Highlights

- Fixes the "Ryte is damaged" warning some Apple Silicon Macs showed for 0.5.0. Packages are now ad-hoc signed and the app bundle's signature is verified before packaging succeeds, replacing disabled signing that could leave Ryte with an invalid signature.
- Disables hardened runtime for ad-hoc packages to prevent a Team ID mismatch when loading Electron Framework; it stays on for Developer ID builds. PR CI now exercises the packaged native launch.
- Documents checksum verification and a targeted first-launch recovery for macOS's "Ryte is damaged" warning. Downloads still lack Apple notarization.
- Moves the app onto the Stencil design system: semantic design tokens for light and dark, a custom outlined icon set, and shared dialog, menu, popover, tooltip, toast, and disclosure behavior with consistent Escape, focus-return, and keyboard handling, checked by real-Chromium keyboard contract tests. Renderer only; no changes to storage, indexing, or search behavior.

### Validation

- `pnpm --dir app validate`
- `pnpm --dir app smoke:indexer` (synthetic fixtures)
- `pnpm dmg:local` (ad-hoc signed Apple Silicon package)

## 0.5.0 (earlier numbering)

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

## 0.3.0 (earlier numbering)

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

Ryte follows [Semantic Versioning 2.0.0](https://semver.org): `MAJOR.MINOR.PATCH`.

- While the version is `0.y.z`, the app is still taking shape. A minor bump (`0.2.0`) adds features or changes behavior in a way that can affect existing notes, settings, or the file formats and tools agents rely on. A patch bump (`0.1.1`) is a fix with no intended behavior change.
- `1.0.0` marks a stable agent file contract and tool surface. After that, a breaking change to either needs a major bump.
- The bump follows the Conventional Commits in the release: `fix` is a patch, `feat` is a minor, and a breaking change (`!` or a `BREAKING CHANGE:` footer) is a minor before 1.0 and a major after.
- Git tags are `v` plus the app version, for example `v0.1.0`. A tag with a suffix, such as `v0.1.0-rc.1`, is a dry run: the release workflow builds, signs, notarizes, and verifies but publishes nothing.
- A published tag is never moved or reused. A bad release is fixed with the next patch version.
- macOS build numbers should be monotonically increasing integers once packaged distribution starts.
- Releases before 0.1.0 of this repository were numbered by project phase (`0.1.x` foundation, `0.2.x` security and privacy, `0.3.x` local-first search, `0.4.x` first downloadable build, `0.5.x` Preferences and search redesign). They do not follow these rules.
