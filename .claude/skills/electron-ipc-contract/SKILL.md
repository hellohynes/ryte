---
name: electron-ipc-contract
description: Add, change, remove, or migrate a Ryte operation or event between the main process and the UI through the API contract in app/src/contract. Use for new IPC operations, payload changes, events, subscriptions, handler behavior, cancellation, or IPC security fixes.
---

# Ryte API Contract

Every operation and event that crosses main, preload and renderer is defined once in `app/src/contract/`. Types,
validation, IPC registration and `window.ryte` are derived from that definition. Never hand-write a channel string,
an `ipcMain` or `ipcRenderer` call, a validator, or a preload method: `pnpm check:contract` fails on them.

## Read first

- `docs/api-contract.md`: where things live, and the procedures for add, add an event, change, remove, and migrate a
  legacy operation. Follow the one that matches your change, step by step.
- `docs/api-index.md`: everything that exists today (generated). Check it before adding: an operation may already do
  this.

## Contract

Before editing, record (in your report or the pull request description; there is no file for it): the operation
or event name and channel, the renderer action that starts it, the input schema (strict and bounded), the response
and error behavior, which windows receive an event and who emits it, cancellation or unsubscribe behavior,
payload-size bounds, and the test that will prove it.

## Workflow

1. Check `docs/api-index.md` and `app/scripts/legacy.json`: is the operation already in the contract, or still legacy?
2. Follow the matching procedure in `docs/api-contract.md`. A new operation always goes in `app/src/contract/`, even in
   an area that has not been migrated.
3. Keep the boundaries: filesystem, SQLite, credentials, provider calls and external links stay in main. The handler
   receives validated input and takes its dependencies as parameters so it can be tested without Electron. The
   renderer only calls `window.ryte`. Expose narrow, typed operations; there are no generic passthroughs.
4. Do not leak paths, note content or credentials in errors. A rejected input reports the operation and field names
   only.
5. Events go through the injected `emit`, never `webContents.send`. Name the owning window or the broadcast, the
   cleanup trigger, and the cancellation path; do not broadcast to unrelated windows.
6. After any edit to a definition run `pnpm contract:generate`, commit the generated files, and run `pnpm typecheck`
   (a missing or extra handler is only a compile error; `pnpm check:contract` does not report it).
7. Test at the handler seam with fake dependencies, then run `pnpm validate`. For a change that crosses processes,
   observe it in the running app with synthetic fixtures (never real notes).

## Hard rules

- Never rename a channel: it is the wire name. Add the new operation, move the callers, remove the old one.
- Never edit `manifest.generated.ts`, `docs/api-index.md` or `tasks.vectors.expected.json` by hand.
- Do not add to `app/scripts/legacy.json`; it only shrinks. Delete its entries when you migrate an operation.
- An operation exposed to agents (when that exists) is additive-only: add optional fields and new operations,
  deprecate before removing.

## Output

Report the contract matrix (each operation or event added, changed or removed, with its channel), the files touched
including generated ones, the validation run, the event lifecycle, and residual risk.
