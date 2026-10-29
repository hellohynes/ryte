# Phase 0 Manual Smoke

Use this checklist before merging the Phase 0 foundation PR. Do not paste real note content, API keys, local database paths, or private file excerpts into this document or a PR.

## Environment

- Date: 2026-05-19
- Branch: `feat/ryte-foundation`
- App version: `0.1.0`
- Node version: `v24.14.1`
- pnpm version: `10.12.1`
- macOS version: `26.4.1`

## Required Automated Checks

- [x] `pnpm guard:branch`
- [x] `pnpm validate`
- [x] `pnpm smoke:indexer`

## Manual App Checks

| Check                                                                      | Result   | Notes                                                                                                                                            |
| -------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Launch app under Node 24                                                   | Pass     | Launched Electron with an isolated temp profile and synthetic notes.                                                                             |
| Existing notes root loads                                                  | Pass     | Synthetic notes root loaded; no real notes were used.                                                                                            |
| File tree renders                                                          | Pass     | Synthetic markdown files rendered in the sidebar.                                                                                                |
| New markdown file appears without refresh                                  | Pass     | Synthetic markdown file appeared through the watcher.                                                                                            |
| Deleted or moved markdown file disappears without refresh                  | Pass     | Deleted synthetic markdown file disappeared through the watcher.                                                                                 |
| Local search returns sources for a natural-language query with punctuation | Pass     | `alpha / beta status` returned the expected synthetic source.                                                                                    |
| GPT-5.2 cloud answer streams after sources                                 | Deferred | Requires intentional cloud enablement and provider key.                                                                                          |
| Provider/model API failure is visible and contextual                       | Partial  | Covered by unit tests and local skipped-state smoke; live provider failure deferred.                                                             |
| Search history persists after app restart                                  | Pass     | Verified by relaunching the same isolated temp profile.                                                                                          |
| Clear removes search history                                               | Pass     | Verified from the search overlay after restart.                                                                                                  |
| Settings Rebuild Index button starts a local reindex                       | Pass     | Rebuild completed in Settings with no visible indexing error.                                                                                    |
| Settings save triggers reindex without database corruption                 | Pass     | Save closed Settings and no indexing/database error appeared.                                                                                    |
| Settings shows app version                                                 | Pass     | Settings footer showed `Ryte 0.1.0`.                                                                                                             |
| Normal actions do not spam Electron macOS menu warnings                    | Pass     | Smoke logs did not include `representedObject is not a WeakPtrToElectronMenuModelAsNSObject`; only the existing `punycode` deprecation appeared. |

## Optional Controlled Recovery Check

Only run this if the tester explicitly chooses to exercise database recovery. Back up the local index database first, use a synthetic or disposable app data directory when practical, and do not commit database files.

| Check                                       | Result  | Notes                                                                            |
| ------------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| Malformed local index database is recovered | Not run | Covered by automated recovery tests; optional manual recovery was not exercised. |

## Follow-Ups

Record any failures here with a short description and the target follow-up phase or PR.

- Phase 0 manual smoke used only synthetic notes and an isolated Electron user data directory.
- Live cloud answer streaming and live provider/model API failure checks remain follow-ups because they require intentional cloud provider use.
