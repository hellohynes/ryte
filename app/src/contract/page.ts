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
    "Show an HTML page from the notes folder in its own view over the given area of the window. The view is sandboxed, with no Node and no Ryte API, and otherwise opens like a normal browser tab: the page can read any file of the notes folder (never outside it, and not hidden or `node_modules` folders), use the internet, the clipboard, downloads (the macOS save dialog, only while its view is showing) and alert boxes, and keeps what it saves across restarts. It cannot move itself to another address. Camera, microphone, location, other devices and notifications are refused, and a link or a new window opens in the browser only on a real click. Showing a page whose view is still alive, and whose file has not changed, only moves and reveals it, and hides the window's other page views. Returns `shown`, or why not: `missing`, `blocked` (outside the notes folder, or not an HTML page) or `too-large` (over 10 MB).",
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
    'Hide the page view that is showing, for example while an overlay is open, because a native view always draws on top. Returns a still picture of the page (a data URL) to show in its place, or null when there is none.',
  input: z.undefined(),
  output: z.object({ still: z.string().nullable() }),
  example: { input: undefined, output: { still: null } }
})

export const park = defineOperation({
  channel: 'page:park',
  description:
    "A page's tab went to the background: hide its view but keep it alive, so the page is as it was when the tab comes back. The app keeps page and other kept views alive until they use more than about 1.5 GB together or there are more than 24; then the ones shown longest ago go to sleep and load again when their tab returns.",
  input: z.strictObject({ path: sourcePath }),
  output: z.void(),
  example: { input: { path: 'review/index.html' }, output: undefined }
})

export const close = defineOperation({
  channel: 'page:close',
  description:
    "Close this page's view, shown or hidden. What the page saved stays. The next show loads it again.",
  input: z.strictObject({ path: sourcePath }),
  output: z.void(),
  example: { input: { path: 'review/index.html' }, output: undefined }
})

export const retain = defineOperation({
  channel: 'page:retain',
  description:
    'The pages that have a tab open in this window. The view of any other page is closed, so a closed, renamed or deleted tab does not leave a page running.',
  input: z.strictObject({ paths: z.array(sourcePath).max(1000) }),
  output: z.void(),
  example: { input: { paths: ['review/index.html'] }, output: undefined }
})

export const openInBrowser = defineOperation({
  channel: 'page:open-in-browser',
  description:
    'Open an HTML page from the notes folder in the default browser, in a browser outside Ryte, after checking again that it is inside the notes folder and an HTML page. This is for the button the person presses. Returns whether it opened.',
  input: z.strictObject({ path: sourcePath }),
  output: z.object({ opened: z.boolean() }),
  example: { input: { path: 'review/index.html' }, output: { opened: true } }
})

export const blocked = defineEvent({
  channel: 'page:blocked',
  description:
    'The open page tried something its view refuses (a link without a real click, or a permission such as the camera). Carries how many things were blocked since the page opened and the addresses of the last 50, as plain text.',
  payload: z.object({ count: z.number(), addresses: z.array(z.string()) })
})

export const page = defineArea('page', {
  operations: { show, setBounds, hide, park, close, retain, openInBrowser },
  events: { blocked }
})
