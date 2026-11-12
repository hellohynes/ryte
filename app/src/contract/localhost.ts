import { z } from 'zod'

import { MAX_LOCAL_ADDRESS_LENGTH } from '../shared/local-address'
import { defineArea, defineOperation } from './define'
import { integer } from './primitives'
import { exampleState, workspaceState } from './workspace'

const address = z.string().min(1).max(MAX_LOCAL_ADDRESS_LENGTH)

/** Where the page's view sits, in pixels from the window's top left corner. */
const bounds = z.strictObject({
  x: integer,
  y: integer,
  width: integer.refine((value) => value >= 0 && value <= 20_000, 'Expected a size'),
  height: integer.refine((value) => value >= 0 && value <= 20_000, 'Expected a size')
})

export const listApprovals = defineOperation({
  channel: 'localhost:list-approvals',
  description:
    'The local addresses the person chose to always allow, as origins (scheme, host and port), oldest first.',
  input: z.undefined(),
  output: z.array(z.string()),
  example: { input: undefined, output: ['http://localhost:5173'] }
})

export const removeApproval = defineOperation({
  channel: 'localhost:remove-approval',
  description:
    'Forget an always-allowed origin and close any open view of it, so the next open asks again. Returns the remaining origins.',
  input: z.strictObject({ origin: address }),
  output: z.array(z.string()),
  example: { input: { origin: 'http://localhost:5173' }, output: [] }
})

export const open = defineOperation({
  channel: 'localhost:open',
  description:
    'Approve opening a local address after the person answered the prompt, and open it in a tab (focusing the tab that has it). Refused unless the window just had a real click, Enter or Space, each used once, so a script cannot answer the prompt for the person. `always` remembers the origin and keeps the tab across restarts; `once` allows it until the tab closes. Refuses anything that is not `http` or `https` on `localhost`, `127.0.0.1` or `[::1]`. Returns the new workspace, or `refused`.',
  input: z.strictObject({ url: address, choice: z.enum(['once', 'always']) }),
  output: z.discriminatedUnion('status', [
    z.object({ status: z.literal('ok'), workspace: workspaceState }),
    z.object({ status: z.literal('refused') })
  ]),
  example: {
    input: { url: 'http://localhost:5173', choice: 'always' },
    output: { status: 'ok', workspace: exampleState }
  }
})

export const release = defineOperation({
  channel: 'localhost:release',
  description:
    'A tab opened with `once` was closed: forget that one-time allowance. An always-allowed origin is not affected.',
  input: z.strictObject({ url: address }),
  output: z.void(),
  example: { input: { url: 'http://localhost:5173/' }, output: undefined }
})

export const show = defineOperation({
  channel: 'localhost:show',
  description:
    'Show an approved local address in a locked view over the given area of the window. The page can reach only its own origin, including its live-reload connection, and cannot reach the internet, other ports, other spellings of this Mac, the notes folder, new windows, downloads or permissions. Showing the address that is already open only moves and reveals it. Returns `shown`, `needs-approval` (not approved, or the approval was removed) or `blocked` (not a local address).',
  input: z.strictObject({ url: address, bounds }),
  output: z.object({ status: z.enum(['shown', 'needs-approval', 'blocked']) }),
  example: {
    input: { url: 'http://localhost:5173/', bounds: { x: 240, y: 80, width: 900, height: 600 } },
    output: { status: 'shown' }
  }
})

export const setBounds = defineOperation({
  channel: 'localhost:set-bounds',
  description: 'Move and resize the open local view to a new area of the window.',
  input: z.strictObject({ bounds }),
  output: z.void(),
  example: { input: { bounds: { x: 240, y: 80, width: 900, height: 600 } }, output: undefined }
})

export const hide = defineOperation({
  channel: 'localhost:hide',
  description:
    'Hide the open local view, for example while an overlay is open, because a native view always draws on top. Returns a still picture of the page (a data URL) to show in its place, or null when there is none.',
  input: z.undefined(),
  output: z.object({ still: z.string().nullable() }),
  example: { input: undefined, output: { still: null } }
})

export const park = defineOperation({
  channel: 'localhost:park',
  description:
    "A local address's tab went to the background: hide its view but keep it, and its session, alive. A window keeps at most 4 local views alive; showing another pushes out the one shown longest ago.",
  input: z.strictObject({ url: address }),
  output: z.void(),
  example: { input: { url: 'http://localhost:5173/' }, output: undefined }
})

export const close = defineOperation({
  channel: 'localhost:close',
  description:
    "Close this address's local view, shown or hidden. The page keeps nothing. The next show loads it again.",
  input: z.strictObject({ url: address }),
  output: z.void(),
  example: { input: { url: 'http://localhost:5173/' }, output: undefined }
})

export const retain = defineOperation({
  channel: 'localhost:retain',
  description:
    'The local addresses that have a tab open in this window. The view of any other address is closed.',
  input: z.strictObject({ urls: z.array(address).max(1000) }),
  output: z.void(),
  example: { input: { urls: ['http://localhost:5173/'] }, output: undefined }
})

export const openInBrowser = defineOperation({
  channel: 'localhost:open-in-browser',
  description:
    'Open a local address in the default browser, outside the locked view, after checking again that it is a local address. The page runs unlocked there, so this is only for the button the person presses. Returns whether it opened.',
  input: z.strictObject({ url: address }),
  output: z.object({ opened: z.boolean() }),
  example: { input: { url: 'http://localhost:5173/' }, output: { opened: true } }
})

export const localhost = defineArea('localhost', {
  operations: {
    listApprovals,
    removeApproval,
    open,
    release,
    show,
    setBounds,
    hide,
    park,
    close,
    retain,
    openInBrowser
  },
  events: {}
})
