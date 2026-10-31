# API contract

Every operation and event that crosses between the main process and the UI is defined **once**, in
`app/src/contract/`. Types, input validation, IPC registration and the `window.ryte` API are derived from that
definition, and `pnpm check:contract` stops the old hand-written pattern (a channel string, an
`ipcMain.handle`, a validator and a preload method per operation) from coming back.

The list of everything that exists today is generated: [api-index.md](api-index.md).

## Where things live

| What | Where | Edit it? |
| --- | --- | --- |
| The definition of each operation and event (channel, input, response, example) | `app/src/contract/<area>.ts` | Yes: this is the one place |
| The registry of areas | `app/src/contract/index.ts` | Only to add or remove an area |
| Channel names for the preload | `app/src/contract/manifest.generated.ts` | No: `pnpm contract:generate` |
| The list of operations | `docs/api-index.md` | No: `pnpm contract:generate` |
| What an operation does in the main process | `app/src/main/contract/<area>-handlers.ts` | Yes: one handler per operation |
| Registration, validation, the event emitter | `app/src/main/contract/register.ts` | Rarely |
| `window.ryte.<area>` methods and `on<Event>` subscribers | built from the manifest by `app/src/preload/contract-api.ts` | No |
| Wire types by name, for code that imports them (the `tasks` types live in `app/src/shared/tasks.ts`) | `app/src/shared/<area>.ts` | Only to re-export types inferred from the definition (`export type { ... } from '../contract/<area>'`); never write a type by hand. A new operation does not need one unless code imports its types by name |
| Operations that have not moved yet | `app/scripts/legacy.json` and the old code in `ipc.ts`, `ipc-validation.ts` and `preload/index.ts` | Only to shrink them |
| The enforcement | `app/scripts/check-contract.mjs` | Rarely |

## How a call flows

```text
renderer      window.ryte.tasks.toggle(input)               built from manifest.generated.ts
   |
preload       ipcRenderer.invoke('tasks:toggle', input)     forwards one argument, nothing else
   |
main          registerOperations: parse input with the operation's schema, then call the handler
   |             (a rejected input never reaches the handler; the error names fields, never values)
   v
handler       createTaskHandlers(...).toggle(parsedInput, { sender })
```

An event goes the other way: the handler calls `emit(contract.tasks.events.changed)`, the emitter sends it to every
live window, and the renderer subscribes with `window.ryte.tasks.onChanged(callback)`.

## Add an operation

1. **Define it** in `app/src/contract/<area>.ts` and add it to that area's `operations`:

   ```ts
   export const ping = defineOperation({
     channel: 'tasks:ping', // area:verb-noun, lowercase and hyphenated
     description: 'One sentence a reader of api-index.md understands.',
     input: z.strictObject({ id: z.string().max(200) }), // z.undefined() when there is no input
     output: z.object({ ok: z.boolean() }),
     example: { input: { id: 'a' }, output: { ok: true } }
   })
   ```

   - One input value, and always a **strict** object so unknown keys are rejected. Reuse `sourcePath` and `integer`
     from `primitives.ts` for paths and integers. If a field is optional, add
     `.refine(hasNoExplicitUndefined, ...)` so an explicit `undefined` is rejected too.
   - The `example` is validated against both schemas by a test, so it must be real.
   - A **new area** is a new file `app/src/contract/<area>.ts` exporting `defineArea('<area>', { operations,
     events })` (both are required: pass `events: {}` when there are none), added to `contract` in
     `app/src/contract/index.ts` with an import and an entry. A new operation always goes in the contract,
     even in an area that has not been migrated yet (see [Legacy operations](#legacy-operations)).

     ```ts
     // app/src/contract/reports.ts
     export const ping = defineOperation({ /* as above, with input: z.undefined() */ })
     export const reports = defineArea('reports', { operations: { ping }, events: {} })

     // app/src/contract/index.ts: the key is the area name, and `window.ryte.reports` follows from it
     export const contract = { indexer, reports, tasks } as const
     ```

2. **Regenerate**: `pnpm contract:generate`. It rewrites `manifest.generated.ts` and `docs/api-index.md`. Commit both.
   Forgetting this fails `pnpm check:contract` and `pnpm contract:generate --check`. `pnpm typecheck` fails from here
   until step 3 is done ("Property 'ping' is missing"): that is the compiler pointing at the missing handler.

3. **Write the handler** in `app/src/main/contract/<area>-handlers.ts`: add `ping: async (input, ctx) => ...` to the
   object returned by `create<Area>Handlers`. The type makes a missing or extra handler a compile error, so run
   `pnpm typecheck` now: `pnpm check:contract` does not report a missing handler. `input` is
   already validated and typed; `ctx.sender` is the window that called. Take dependencies as parameters (the way
   `createTaskHandlers` takes `service`, `settings` and `emit`) so the handler can be tested without Electron.
   - **New area:** create `<area>-handlers.ts` exporting `create<Area>Handlers(...)` that returns
     `Handlers<Contract>['<area>']`, and add `<area>: create<Area>Handlers(...)` to the `registerOperations(ipcMain,
     contract, { ... })` call in `app/src/main/ipc.ts` (with its import). A handler with no dependencies takes no
     parameters:

     ```ts
     // app/src/main/contract/reports-handlers.ts
     import type { Contract } from '../../contract'
     import type { Handlers } from './register'

     export function createReportsHandlers(): Handlers<Contract>['reports'] {
       return { ping: async () => ({ ok: true }) }
     }
     ```

4. **Test the handler** in `app/src/main/contract/<area>-handlers.test.ts` with fake dependencies: the result, and
   any side effect (for example "emits only when the toggle succeeded"). Copy the pattern from
   `tasks-handlers.test.ts`: call the handler directly, as `handlers.ping(input, { sender: {} as never })`. Validation and the example are already
   covered for every operation by `app/src/contract/contract.node.test.ts` and `register.test.ts`. Those tests derive
   from the contract, so adding an operation or an area does not need an edit to them.

5. **Call it** from a store or component: `await window.ryte.<area>.ping({ id })`. The types come from the
   definition, so `app/src/preload/index.ts` and `app/src/shared/` need no edit. `window.ryte.<area>.<operation>` and its
   types appear on their own, also in an area that still has hand-written methods.

6. Run `pnpm validate`.

## Add an event

Define it with `defineEvent({ channel, description, payload? })` in the area file and add it to `events`. Run
`pnpm contract:generate`. In a handler (or a watcher), call the injected `emit(contract.<area>.events.<name>)`, with
the payload as the second argument when the event has one. A payload is typed at compile time, but nothing
validates it at runtime (main is trusted), so keep it plain data. The UI subscribes with
`window.ryte.<area>.on<Name>(callback)`, which returns an unsubscribe function. Never call `webContents.send` yourself.
`app/src/contract/indexer.ts` (the `status` event) and `forwardIndexerStatus` in
`app/src/main/contract/indexer-handlers.ts` are a worked example of an event with a payload.

## Change an operation

Edit the definition, run `pnpm contract:generate`, then run `pnpm typecheck` and follow the compiler: the handler's
types change, and so does every caller. Rules:

- **Never rename a channel.** It is the wire name. Add the new operation, move the callers, then remove the old one.
- Adding an optional input field or an extra output field is safe. Tightening or reinterpreting an input changes
  behavior: say so in the change.
- `tasks.list` and `tasks.toggle` are covered by recorded vectors of the behavior they had before the contract
  (`app/src/contract/tasks.vectors.*`, recorded from the pre-contract code at `c4c7b3c`; the one-shot recorder was
  deleted with the old validators and is in git history at `a9ce30b:app/src/contract/record/record-vectors.ts`). If
  you intentionally change what they accept, add an entry with a reason to
  `ACCEPTED_DEVIATIONS` in `tasks.vectors.deviations.ts`. Do not edit `tasks.vectors.expected.json`: it is the
  oracle.
- An error message is not a contract. The UI shows `error.message` for a rejected input, but only for input its own
  callers never send.

## Remove an operation or event

Delete the definition and its entry in the area, run `pnpm contract:generate`, then delete the handler, its test and
every caller. Run `pnpm typecheck` and `pnpm test`: the compiler reports the leftovers (an extra handler is an
error), so `typecheck` fails between deleting the definition and deleting the handler. Removing a whole area also removes its file, its import and entry in `app/src/contract/index.ts`, its
handlers file and that file's test, and its import and entry in the `registerOperations` call in
`app/src/main/ipc.ts`.

## Legacy operations

Operations that predate the contract still run through `ipc.ts`, `ipc-validation.ts` and `preload/index.ts`, and are
listed in `app/scripts/legacy.json`. Rules:

- **New operations never go there.** `check:contract` rejects a channel that is in neither the contract nor
  `legacy.json`.
- **Migrate an operation when you touch it, or sweep a whole area.** To migrate one:
  1. Record what the old validator accepts and rejects first (authored inputs, expectations recorded from the old
     code) so the new schema is checked against behavior it cannot influence. `tasks.vectors.*` is the example.
  2. Define it in the contract, write the handler, and delete the old `ipcMain.handle`, the `assertValid*`
     function and its test, and the preload method and type.
  3. Delete its channel from `legacy.json`. When a legacy file no longer reaches IPC at all, delete it from the
     list too. `check:contract` fails on a stale entry, so the list only ever shrinks.
- A half-migrated area works: contract methods are merged into the hand-written `window.ryte.<area>` object.

## What is enforced

`pnpm validate` runs `pnpm contract:generate --check`, `pnpm check:contract` and the check's own tests:

- Every channel string in `src/main`, `src/preload`, `src/shared` and `src/contract` is a contract channel or in
  `legacy.json`, and a contract channel is written as a string only inside `src/contract/`.
- Only the legacy files, `register.ts` and `contract-api.ts` may use `ipcMain`, `ipcRenderer`, `.send`, `.sendSync`,
  `.sendToFrame` or `.postMessage`.
- A channel is never built by concatenation or a template (`'tasks' + ':x'`, `` `tasks:${name}` ``) in an IPC call.
- A channel name in an IPC call is always `area:name`, lowercase and hyphenated (`files:read-source`, not
  `files:readAll`), checked on `ipcMain`, `ipcRenderer`, `.ipc` and the send methods of `webContents` and `sender`.
  `webContents.on('will-navigate')` and similar Electron events are not channels.
- Every script file under `src/` is scanned (`.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`), and `.vue`
  files through their `<script>` blocks.
- `src/contract/` never imports Electron, and is imported by value only from `src/main/` (and, for the manifest, the
  preload builder). The renderer never touches `ipcRenderer` or `electron`.
- `legacy.json` cannot grow without editing the check's own test, whose numbers are exact: a migration that shrinks
  the list lowers them.

Two escape hatches exist, both in `app/scripts/legacy.json`, both need a reason and both are held at zero by that
test, so using one is a deliberate, reviewed edit: `ignore` for a string that merely looks like a channel (a DOM
event, a cache key), and `sendAllowed` for a file that calls `.send` or `.postMessage` on something that is not IPC
(a worker, a WebSocket).

It is a guardrail against authoring mistakes, not a security boundary: the renderer is sandboxed and reaches the main
process only through `window.ryte`. It does not try to stop deliberate
evasion, for example a computed property name (`e['ipc' + 'Main']`), a channel name hidden behind a helper, or a
local alias of `webContents` inside a legacy file.
Review catches those.

## Not covered yet

- Operations with several positional arguments (`search:query(q, options)`): give the operation one object input when
  you migrate it.
- Long-running or cancellable operations and streams (`search:cancel`, search events): each needs a design.
- Exposing an operation to agents over MCP. When that lands, an exposed operation is **additive-only**: agents ship
  separately from Ryte, so add optional fields and new operations, and deprecate before removing.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm contract:generate` | Rewrite the manifest and `docs/api-index.md` from the definitions |
| `pnpm contract:generate --check` | Fail if either is stale |
| `pnpm check:contract` | The enforcement above |
| `pnpm test:contract-scripts` | The check's own tests |
| `pnpm typecheck` | Catches a missing or extra handler and every caller that no longer matches |
| `pnpm test` | The whole test suite |
| `pnpm validate` | Everything, including the above |
