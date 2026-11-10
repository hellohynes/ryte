import { z } from 'zod'

import { defineArea, defineEvent, defineOperation } from './define'
import { integer, sourcePath } from './primitives'

/** Where the page's view sits, in pixels from the window's top left corner. */
const bounds = z.strictObject({
  x: integer,
  y: integer,
  width: integer.refine((value) => value >= 0 && value <= 20_000, 'Expected a size'),
  height: integer.refine((value) => value >= 0 && value <= 20_000, 'Expected a size')
})

export const show = defineOperation({
  channel: 'page:show',
  description:
    'Show an HTML page from the notes folder in a locked view over the given area of the window. The page loads only from its own folder and cannot reach the network, other files, new windows, downloads or permissions. Showing the page that is already open only moves and reveals it. Returns `shown`, or why not: `missing`, `blocked` (outside the notes folder, or not an HTML page) or `too-large` (over 10 MB).',
  input: z.strictObject({ path: sourcePath, bounds }),
  output: z.object({ status: z.enum(['shown', 'missing', 'blocked', 'too-large']) }),
  example: {
    input: { path: 'review/index.html', bounds: { x: 240, y: 80, width: 900, height: 600 } },
    output: { status: 'shown' }
  }
})

export const setBounds = defineOperation({
  channel: 'page:set-bounds',
  description: 'Move and resize the open page view to a new area of the window.',
  input: z.strictObject({ bounds }),
  output: z.void(),
  example: { input: { bounds: { x: 240, y: 80, width: 900, height: 600 } }, output: undefined }
})

export const hide = defineOperation({
  channel: 'page:hide',
  description:
    'Hide the open page view, for example while an overlay is open, because a native view always draws on top. Returns a still picture of the page (a data URL) to show in its place, or null when there is none.',
  input: z.undefined(),
  output: z.object({ still: z.string().nullable() }),
  example: { input: undefined, output: { still: null } }
})

export const close = defineOperation({
  channel: 'page:close',
  description: 'Close the open page view and forget its folder. The page keeps nothing.',
  input: z.undefined(),
  output: z.void(),
  example: { input: undefined, output: undefined }
})

export const blocked = defineEvent({
  channel: 'page:blocked',
  description:
    'The open page tried something the locked view refuses. Carries how many things were blocked since the page opened and the addresses of the last 50, as plain text.',
  payload: z.object({ count: z.number(), addresses: z.array(z.string()) })
})

export const page = defineArea('page', {
  operations: { show, setBounds, hide, close },
  events: { blocked }
})
