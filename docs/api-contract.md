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
| Wire types by name, for code that imports them (for example `app/src/shared/tasks.ts` and `app/src/shared/indexer.ts`) | `app/src/shared/<area>.ts` | Only to re-export types inferred from the definition (`export type { ... } from '../contract/<area>'`); never write a type by hand. A new operation does not need one unless code imports its types by name |
| Wiring | `app/src/main/ipc.ts` passes `ipcMain` to `registerOperations`; `app/src/preload/index.ts` passes `ipcRenderer` to `createContractApi` | Only to register a new handlers module; never a channel, validator or handler |
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
live window, and the renderer subscribes with `window.ryte.tasks.onChanged(callback)`. To reach one window only, use
`emit.to(webContents, event, payload)` (see [Add an event](#add-an-event)).

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
     `app/src/contract/index.ts` with an import and an entry.

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
   already validated and typed; `ctx.sender` is the `WebContents` of the page that called. Take dependencies as parameters (the way
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

**Broadcast or one window.** `emit(event, payload)` sends to every live window: use it for state every window shows
(tasks, indexer status). `emit.to(webContents, event, payload)` sends to that one `WebContents` and nobody else: use it
when the event belongs to one window (a search's results, a menu command), because a broadcast would show it in every
other window. Both skip a destroyed window, and a failed send is logged (channel and reason, never the payload)
without throwing. A handler gets the asking page's `WebContents` as `ctx.sender`, which is what `emit.to` takes. For any other target, take the emitter and the
window lookup as parameters so a test can use fake windows:

```ts
// app/src/main/menu-command.ts: the focused window, else the first, gets the command
emitTo(target.webContents, contract.app.events.menuCommand, command)
```

Name the key so the renderer-facing subscriber keeps the name you want: key `menuCommand` becomes
`window.ryte.app.onMenuCommand`. The area, not the channel prefix, decides where the subscriber appears: the
`files` area carries `viewer:source-changed` as `window.ryte.files.onSourceChange`, because that is where the
renderer already subscribed.

A payload that accepts `undefined` (`schema.optional()`) is an optional argument, `(payload?: X) => void`. Send it
explicitly, `emit(event, undefined)`, so the wire carries the `undefined` as before. `files.catalogChanged` uses it:
no payload means refresh the whole catalog.

## Change an operation

Edit the definition, run `pnpm contract:generate`, then run `pnpm typecheck` and follow the compiler: the handler's
types change, and so does every caller. Rules:

- **Never rename a channel.** It is the wire name. Add the new operation, move the callers, then remove the old one.
- Adding an optional input field or an extra output field is safe. Tightening or reinterpreting an input changes
  behavior: say so in the change.
- An area migrated from hand-written validators is covered by recorded vectors of the behavior it had before the
  contract: `tasks` (`app/src/contract/tasks.vectors.*`, recorded from the pre-contract code at `c4c7b3c`) and
  `settings` (`app/src/contract/settings.vectors.*`, recorded at `322bfd7`) and `workspace` (`app/src/contract/workspace.vectors.*`,
  recorded at `ea721df`, and for the open-file, open-recent-file and record-recent operations at `cdd80d2`) and `files` (`app/src/contract/files.vectors.*`, recorded at `bb14ce4`) and `search` (`app/src/contract/search.vectors.*`, recorded at `68bf229`, and `app/src/contract/search.query.vectors.*` for the query text, the options and the request id, recorded at `1bffddd`). `<area>.vectors.inputs.ts` holds the authored
  inputs, `<area>.vectors.expected.json` is the oracle recorded from the old validators, and a test checks every vector
  against the new schemas. The one-shot recorders were deleted with the old validators and are in git history
  (`a9ce30b:app/src/contract/record/record-vectors.ts` and
  `88ee7dc:app/src/contract/record/record-settings-vectors.ts`); the workspace validators it was recorded from are in
  `ea721df:app/src/main/ipc-validation.ts` and `cdd80d2:app/src/main/ipc-validation.ts`, the files validators in
  `bb14ce4:app/src/main/ipc-validation.ts`, and the search freshness validator in
  `68bf229:app/src/main/ipc-validation.ts`, and the search query, options and request-id validators in
  `1bffddd:app/src/main/ipc-validation.ts`. If you intentionally change what an operation accepts,
  add an entry with a reason to `ACCEPTED_DEVIATIONS` in `<area>.vectors.deviations.ts`; only a change that is stricter than
  the recording is a deviation, and anything that accepts more than the old validator did is a defect. Do not edit
  `<area>.vectors.expected.json`: it is the oracle.
- `<area>.wire-types.ts` (`tasks`, `indexer`, `settings`, `workspace`, `files`, `search`) is a **frozen copy** of the hand-written declarations the contract
  replaced (for `search`, those declarations with the owner's decision to take one object where the old methods took
  positional arguments), kept as the oracle for the compile-time check in `<area>.wire-types.check.ts`: the types inferred from the
  definition must equal it. It is hand-written on purpose and is the one exception to "never write a type by hand"; do not
  edit it to make the check pass. Keep it for as long as the contract should not drift from what those declarations said;
  delete it, with its check, only when the owner decides the types may change freely.
- An error message is not a contract. The UI shows `error.message` for a rejected input, but only for input its own
  callers never send.

## Remove an operation or event

Delete the definition and its entry in the area, run `pnpm contract:generate`, then delete the handler, its test and
every caller. Run `pnpm typecheck` and `pnpm test`: the compiler reports the leftovers (an extra handler is an
error), so `typecheck` fails between deleting the definition and deleting the handler. Removing a whole area also removes its file, its import and entry in `app/src/contract/index.ts`, its
handlers file and that file's test, and its import and entry in the `registerOperations` call in
`app/src/main/ipc.ts`.

## No hand-written IPC

`app/src/main/ipc.ts` and `app/src/preload/index.ts` hold no channel, validator or handler. They only pass `ipcMain` to
`registerOperations` and `ipcRenderer` to `createContractApi`. A new operation goes in the contract (see
[Add an operation](#add-an-operation)), never in either file. `check:contract` fails on a channel string anywhere
outside `src/contract/`, wiring files included, and on `ipcMain`, `ipcRenderer`, `.send` and the like outside a fixed
list of files (below).

## What is enforced

`pnpm validate` runs `pnpm contract:generate --check`, `pnpm check:contract` and the check's own tests:

- Every channel string in `src/main`, `src/preload`, `src/shared` and `src/contract` is a contract channel, and is
  written as a string only inside `src/contract/`. There is no list of exceptions.
- Only `register.ts`, `contract-api.ts`, `src/main/ipc.ts` and `src/preload/index.ts` (`IPC_ALLOWED` in
  `scripts/check-contract.mjs`) may use `ipcMain`, `ipcRenderer`, `.send`, `.sendSync`, `.sendToFrame` or
  `.postMessage`. The list excuses those names, not channel strings: a channel written in `ipc.ts` or the preload
  still fails.
- A channel is never built by concatenation or a template (`'tasks' + ':x'`, `` `tasks:${name}` ``) in an IPC call.
- A channel name in an IPC call is always `area:name`, lowercase and hyphenated (`files:read-source`, not
  `files:readAll`), checked on `ipcMain`, `ipcRenderer`, `.ipc` and the send methods of `webContents` and `sender`.
  `webContents.on('will-navigate')` and similar Electron events are not channels.
- Every script file under `src/` is scanned (`.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`), and `.vue`
  files through their `<script>` blocks.
- `src/contract/` never imports Electron, and is imported by value only from `src/main/` (and, for the manifest, the
  preload builder). The renderer never touches `ipcRenderer` or `electron`.

It is a guardrail against authoring mistakes, not a security boundary: the renderer is sandboxed and reaches the main
process only through `window.ryte`. It does not try to stop deliberate
evasion, for example a computed property name (`e['ipc' + 'Main']`), a channel name hidden behind a helper, or a
local alias of `webContents` inside a wiring file.
Review catches those.

## Long-running operations and streams

`search` is the worked example (`app/src/contract/search.ts`, `app/src/main/contract/search-handlers.ts`). The pattern:

- The operation **returns an id** at once and does the work after the reply: `query` registers the request, schedules
  the search with `setImmediate`, and returns the id, so the id reaches the window before the first event. Do not
  await the work inside the handler.
- The results are **events to the asking window only**, sent with `emit.to(sender, event, payload)` and never the
  broadcast, each carrying the id (`requestId`) so the renderer can tell its own run from an older one. An id on an
  event is a plain string: a failure before the work starts sends `error` with an empty id.
- The **registry of running requests is owned by the handler module** (`createSearch(...)`), which takes the emitter,
  the id generator and the scheduler as parameters so a test controls them. It returns `{ handlers, cancelAll }`:
  `handlers` goes to `registerOperations` (an extra key there is an error), and `cancelAll` goes to whatever must stop
  every request, here the indexer's clear-and-rebuild hook and the settings restart.
- A request is **cancelled by its owner**: `cancel({ requestId })` stops it only when the calling window started it;
  an unknown, finished or foreign id is ignored and says nothing. Closing the window cancels its requests, and an
  event that finds the window destroyed cancels too. A cancelled request sends no further event, not even a
  terminal one. A finished request leaves the registry, so nothing is cancelled or sent for it afterwards.
- A call that takes options takes **one object**, `{ query, retrievalMode?, answerMode? }`, never positional
  arguments, and an event hands its listener **one object**, `({ requestId, ... }) => void`.

## Not covered yet

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
