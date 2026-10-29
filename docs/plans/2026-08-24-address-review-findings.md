# Address adversarial review findings

**Created:** 2026-08-24  
**Agent:** Codex  
**Status:** VERIFIED  
**Approved:** Yes  
**Iterations:** 0  
**Worktree:** No  
**Type:** Bugfix

## Summary

Address the seven defects from the 2026-08-24 adversarial Electron performance review. The current paths can block the Electron main process during local indexing and startup, replace a full rendered answer for every streamed token, rescan and transfer the complete file catalog on every edit, and leave watcher/search work active beyond its owner. The plan preserves Ryte's local-first behavior and changes no real-note data.

## Scope

In scope:

- Make local-only indexing cooperatively yield and serialize incremental file work.
- Move index-store initialization off the first-window critical path without exposing an uninitialized IPC contract.
- Coalesce watcher events and report background indexing failures.
- Replace full catalog refreshes with targeted catalog updates for individual markdown changes.
- Tie streamed search requests to their requesting `webContents`, including window destruction and settings-driven service replacement.
- Coalesce streamed-answer rendering so each token does not reparse and replace the entire Markdown DOM.
- Correct the stale Node 22 manual-smoke documentation.

Out of scope:

- Changing the local search ranking algorithm, provider contracts, or the notes schema.
- Reading, indexing, or using the user's real notes corpus for validation.
- Introducing worker threads, a new renderer dependency, or speculative caching unrelated to the traced paths.

## Investigation

### Symptom, trigger, and expected behavior

- **Symptom:** Large local indexes can make the app unresponsive; a streamed answer can cause sustained renderer work; a normal note edit causes a full disk walk/catalog transfer; background work can continue after its only window closes or service state changes.
- **Trigger:** Start Ryte with a cold or large index, index without embeddings, edit one markdown file, receive a high-frequency answer stream, close the requesting window, or save settings that restart the indexer while a search is active.
- **Expected:** The first window is created promptly, indexing and watcher jobs yield/serialize safely, a single-file change updates only that file in the renderer catalog, each search stream only targets and survives with its requesting renderer, and answer rendering is bounded to an animation-frame-sized cadence.

### Execution-path evidence

1. `app/src/main/index.ts:127-147` initializes SQLite/index state before `createWindow()`, then starts the watcher and reindex work.
2. `app/src/main/indexing/indexer.ts:93-120` processes every pending file inline. In local-only mode this branch has no `await`; `app/src/main/indexing/chunker.ts:22` uses synchronous file reads and `app/src/main/indexing/vector-store.ts` performs synchronous SQLite writes.
3. `app/src/main/indexing/watcher.ts:25-40` starts unawaited `notifyFileChanged`/`notifyFileRemoved` calls for every event. `app/src/main/indexing/indexer-service.ts:148-171` has no incremental-job serialization or catch boundary.
4. `app/src/main/viewer/file-catalog.ts:80-87` walks and stats the entire root to build every catalog response. `app/src/renderer/src/stores/file-catalog.ts:43-61` requests and replaces that full response after each watcher notification.
5. `app/src/main/ipc.ts:474-509` broadcasts every search event to every window and starts a detached request without ownership. `app/src/main/ipc.ts:207-222` discards the `SearchService` reference on settings restart without cancelling its active controllers.
6. `app/src/renderer/src/components/SearchOverlay.vue:55-61` watches every answer change. Its `renderAnswer` implementation at `:182-225` reparses Markdown, walks the temporary DOM, and replaces `v-html` at `:329-336` for each token appended in `app/src/renderer/src/stores/search.ts:79-83`.
7. `docs/phase-0-manual-smoke.md:9` still names Node 22 although the repository runtime contract is Node 24.

### Existing patterns and constraints

- `SearchService` already owns per-request `AbortController`s and has cancellation coverage in `app/src/main/search/search-service.test.ts:327-367`; ownership cleanup should extend that contract rather than introduce a second request model.
- `useFileCatalogStore` already suppresses stale full-refresh responses (`app/src/renderer/src/stores/file-catalog.ts:22-50` and its corresponding test). Targeted events must retain the same stale-response safety and consume the existing narrow typed preload boundary.
- `watcher.stop()` is asynchronous (`app/src/main/indexing/watcher.ts:50-53`); start/restart sequencing must await it instead of overlapping watchers.
- `buildSearchResults` already de-duplicates cited documents (`app/src/renderer/src/components/search-result-model.ts:18-48`), so rendering coalescing must preserve its current citation/result behavior.
- No CodeGraph or Semble tool is available in this environment. The cross-component path was traced directly through the main process, preload-facing renderer store, and unit-test seams named above.

## Root causes

1. **Main-process indexing has no cooperative boundary in its local-only hot loop.** `Indexer.indexAll` does synchronous filesystem and SQLite work for the full pending set unless an embedding provider happens to yield.
2. **The overlay treats a streamed token as a complete document update.** A reactive deep watcher invokes the full Markdown renderer and replaces the answer subtree for every appended token.
3. **The catalog change signal has no file-level payload.** A single-file notification causes the renderer to call a full-root catalog listing API and replace its entire reactive collection.
4. **Search streams have no renderer ownership and service replacement does not drain them.** IPC broadcasts events globally, while `SearchService` controllers remain reachable through the old service after settings restart.
5. **Watcher jobs are detached instead of queued.** Multiple chokidar events can overlap and rejected incremental jobs have no handler.
6. **Synchronous SQLite startup precedes first window creation.** Schema initialization and potential FTS migration/backfill run before the renderer can begin painting.
7. **The manual test document was not updated with the runtime-contract change.**

## Behavior contract

**Given** a synthetic large markdown fixture, a rapid sequence of watcher events, a high-frequency generated-answer stream, multiple Electron windows, and an index-store restart, **when** the app indexes, edits a file, streams an answer, closes the requesting window, or saves index-related settings, **then** it must:

- keep returning control to Electron during local-only batch indexing and create the first window before deferred index initialization begins;
- run incremental index mutations in a single ordered/coalesced queue, surface failures through the index status path, and stop the old watcher before creating another;
- publish a safe file-level catalog change and patch only that catalog entry (or remove it) without a full `listCatalog` call;
- send query callbacks only to the request's originating `webContents`, cancel all associated requests when it is destroyed, and cancel/drain requests before a service restart;
- render a partial answer no more than once per scheduled frame and render the final answer once, while keeping citation links and source de-duplication intact;
- continue to pass the existing keyword-only/local-search and semantic fallback behaviors; and
- state the Node 24 runtime requirement consistently in documentation.

## Approach

Keep background work owned at its source instead of adding broad caches or a new process:

1. Add small, testable scheduling helpers at the indexer/service/watcher seams. Yield after a bounded local batch, serialize incremental work, coalesce duplicate path events, and make all detached work observed.
2. Split synchronous index-store setup from the first-window path. Register a deliberately not-ready-safe IPC surface, create the window, then initialize/start indexing in a deferred task with status/error reporting.
3. Enrich the catalog watcher/preload event with a narrow changed-path operation and update the Pinia map/list immutably; retain one full hydration path only for initial load/root changes.
4. Add a request-owner registry around search IPC. Send callbacks to the originating `webContents`, remove/cancel on destruction, and cancel the current service before replacing it.
5. Extract a renderer-local answer-render scheduling seam that batches token-driven Markdown rendering on `requestAnimationFrame` (with a deterministic test scheduler), flushing once on completion/error/close.

## Tasks

- [x] **Task 1: Write failing regression coverage for each reviewed execution path.**
  - **Test files:** `app/src/main/indexing/indexer.test.ts`, `app/src/main/indexing/indexer-service.test.ts`, `app/src/main/indexing/watcher.test.ts`, `app/src/main/search/search-service.test.ts`, a focused IPC lifecycle test beside `app/src/main/ipc.ts`, `app/src/renderer/src/stores/file-catalog.test.ts`, and a new focused answer-render scheduling test beside `SearchOverlay.vue`.
  - **RED cases:** local-only indexing yields at a bounded batch boundary; first-window creation precedes deferred store init; watcher bursts are serialized/coalesced and failures become observable; a file event patches/removes one catalog entry without `listCatalog`; only the initiating webContents receives stream callbacks and destroying it aborts the request; indexer settings restart aborts every active search; token bursts schedule one render frame and completion flushes the final answer; manual-smoke runtime text asserts Node 24.
  - **Dependency:** none.

- [x] **Task 2: Implement the scoped lifecycle, scheduling, IPC, and documentation corrections.**
  - **Files:** `app/src/main/index.ts`, `app/src/main/indexing/indexer.ts`, `app/src/main/indexing/indexer-service.ts`, `app/src/main/indexing/watcher.ts`, `app/src/main/ipc.ts`, relevant typed preload/shared search and file-catalog contracts, `app/src/renderer/src/stores/file-catalog.ts`, `app/src/renderer/src/components/SearchOverlay.vue` plus extracted scheduling helper if needed, and `docs/phase-0-manual-smoke.md`.
  - **Acceptance conditions:** satisfy every Behavior contract assertion without widening renderer Node/Electron access or changing local-search availability; preserve current citation/navigation behavior and clean up every listener/timer/request owner on stop, destroy, restart, or unmount.
  - **Dependency:** Task 1 RED tests.

- [x] **Task 3: Run the quality gate and perform synthetic/manual validation.**
  - Run focused regression suites for each changed surface, then `pnpm --dir app validate` and `pnpm --dir app smoke:indexer` using only synthetic fixtures.
  - Exercise the Electron launch path with a synthetic notes root: observe first window availability, index a sufficiently large synthetic fixture, edit one markdown file, start/cancel a generated search, and close its requesting window during streaming. Capture timing marks or IPC call counts for each initially reported bottleneck rather than claiming an improvement by intuition.
  - Run `impeccable detect --json` against explicitly changed Vue/CSS UI files when available. If native UI automation is unavailable, record the limitation and provide a pasteable visual QA checklist instead of claiming visual verification.
  - **Dependency:** Task 2 complete.

## File-operation summary

| Operation | Paths | Why |
|---|---|---|
| Modify | Main indexing, watcher, startup, search IPC/service, shared/preload contracts, catalog store, search overlay | Bound and own the reviewed work at the actual source. |
| Add | Focused regression tests and only small extracted scheduling helpers if required for deterministic testing | Lock in the concurrency and rendering contracts without broad abstractions. |
| Modify | `docs/phase-0-manual-smoke.md` | Align manual instructions with the Node 24 runtime contract. |

No generated output, dependency folder, database, lockfile, or user-note content will be committed.

## Verification matrix

| Scenario | Initial failing proof | Completion evidence |
|---|---|---|
| Local-only index does not monopolize main process | Deterministic batch-yield test with synthetic files | Focused test plus synthetic indexer smoke and timing mark evidence |
| Cold start reaches first window before index-store work | Startup ordering test with deferred init spy | Focused test and Electron launch observation |
| Watcher burst/error ownership | Coalescing and rejection test | Focused watcher/service tests with status/error assertion |
| Single-file catalog update | Store test proving no full list request after a path event | Focused store test and manual synthetic-file edit |
| Search request lifecycle | Multi-window/destroy/restart IPC test | Focused IPC/search tests and cancellation exercise |
| Streamed answer rendering | Frame-coalescing helper test | Focused test plus native UI check when available |
| Runtime documentation | Node 24 text assertion/review | `rg` confirmation and docs diff review |

## Risks and rollback

- Startup deferral must not let calls access an uninitialized indexer. Preserve the existing not-ready error path and add explicit status guards.
- File-level catalog events must not leak absolute user paths; transmit workspace-relative safe paths only through the existing typed preload API.
- Search cancellation can race with a final provider callback. Gate every callback by both owner liveness and abort state, then clean maps in `finally`.
- If queue/coalescing causes a missed file state, a deliberate full reindex remains the recovery path; do not silently discard watcher errors.
- Roll back by reverting the focused commit(s); no persisted-data migration is proposed.

## Verification evidence

- The pre-fix `HEAD` IPC implementation failed 5 lifecycle regressions as expected: it broadcast tokens to another window and did not cancel on owner destruction or settings restart. The restored implementation passed the same focused IPC/watcher suite (12 tests).
- `pnpm --dir app validate` passed: 45 test files / 295 tests, lint, typecheck, and production build under Node v24.14.1.
- `pnpm --dir app smoke:indexer` passed using only its safe synthetic fixture (2 files, 3 chunks) and rebuilt the Electron native dependency successfully.
- An isolated Electron runtime and temporary user-data directory opened a one-file synthetic corpus. Opening Search and submitting `synthetic verification` displayed one local result with two matches; cloud synthesis remained disabled.
- `impeccable detect --json app/src/renderer/src/components/SearchOverlay.vue app/src/renderer/src/components/search-answer-render-scheduler.ts` returned no findings.
- The new regression tests establish bounded scheduling/call counts, but no wall-clock 1k-file profiling trace was collected. This change therefore does not claim a measured startup or indexing-time improvement.
