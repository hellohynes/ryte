import {
  type BrowserWindow,
  session,
  WebContentsView,
  type Session,
  type WebContents
} from 'electron'

import { contract } from '../../contract'
import type { EmitTo } from '../contract/register'
import type { BlockedLog } from './page-blocked'
import { createPageLinkOpener, createRealInputGate, isOpenablePageLink } from './page-links'
import { isPagePermissionAllowed } from './page-permissions'
import { appKeyFor } from './page-keys'
import { isRealPress } from '../real-input'

export interface PageBounds {
  x: number
  y: number
  width: number
  height: number
}

export const rounded = (bounds: PageBounds): PageBounds => ({
  x: Math.round(bounds.x),
  y: Math.round(bounds.y),
  width: Math.max(0, Math.round(bounds.width)),
  height: Math.max(0, Math.round(bounds.height))
})

// The blocked log of each page view, so a refused permission is reported to the page that asked.
const logs = new WeakMap<WebContents, BlockedLog>()

/** The lasting session of this name, kept on disk in the app's data folder (Electron's `persist:` partitions). */
export const lastingSession = (name: string): Session => session.fromPartition(`persist:${name}`)

/**
 * Sets up a session shared by many pages: the clipboard is allowed, every other permission and every device is
 * refused and (for a permission) recorded in the log of the page that asked. Downloads and dialogs are left to
 * Electron, which asks where to save and shows the dialog.
 */
export function setUpPageSession(ses: Session): void {
  ses.setPermissionRequestHandler((contents, permission, callback) => {
    const allowed = isPagePermissionAllowed(permission)
    if (!allowed) logs.get(contents)?.add(`permission: ${permission}`)
    callback(allowed)
  })
  ses.setPermissionCheckHandler((_contents, permission) => isPagePermissionAllowed(permission))
  ses.setDevicePermissionHandler(() => false)
}

export interface PageViewOptions {
  ses: Session
  host: BrowserWindow
  bounds: PageBounds
  log: BlockedLog
  emitTo: EmitTo
  /** Opens an address in the browser. The caller has already checked the kind of address. */
  openExternal: (url: string) => void
  /**
   * Whether the page may load or move to this address itself: `true`, `false` (a link, or blocked), or another
   * address to load in its place. */
  allowNavigation: (url: string, isMainFrame: boolean) => boolean | string
}

/**
 * The sandboxed view both kinds of page share: no preload, no Node, no devtools, no new windows. A link opens in
 * the browser only on a real click, Ryte's own shortcuts are handed to the app before the page sees them, and
 * the view is placed over `bounds` of the host window.
 */
export function createPageView({
  ses,
  host,
  bounds,
  log,
  emitTo,
  openExternal,
  allowNavigation
}: PageViewOptions): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools: false,
      navigateOnDragDrop: false,
      webviewTag: false,
      autoplayPolicy: 'user-gesture-required'
    }
  })
  const contents = view.webContents
  // A page is shown on white, as a browser would, once it has loaded. Until then the view is clear so the stage
  // shows through, and a dark page does not flash white before its first paint.
  view.setBackgroundColor('#00000000')
  contents.once('did-stop-loading', () => view.setBackgroundColor('#ffffff'))
  // A link opens in the browser only when the person just clicked it, and the box itself never loads it.
  logs.set(contents, log)
  const gate = createRealInputGate()
  const openLink = createPageLinkOpener(gate, openExternal)
  contents.on('input-event', (_event, input) => {
    if (isRealPress(input)) gate.note()
  })
  contents.setWindowOpenHandler(({ url }) => {
    if (!openLink(url)) log.add(url)
    return { action: 'deny' }
  })
  contents.on('will-frame-navigate', (event) => {
    // A frame inside the page may load the notes folder's files, and the page may move to another page of it.
    // Everything else is a link (opened only on a real click) or blocked.
    const verdict = allowNavigation(event.url, event.isMainFrame)
    if (verdict === true) return
    event.preventDefault()
    if (typeof verdict === 'string') {
      void contents.loadURL(verdict).catch(() => undefined)
      return
    }
    if (!event.isMainFrame || !isOpenablePageLink(event.url) || !openLink(event.url)) {
      log.add(event.url)
    }
  })
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const appKey = appKeyFor(input, process.platform)
    if (!appKey) return
    event.preventDefault()
    host.webContents.focus()
    if (appKey.kind === 'command') {
      emitTo(host.webContents, contract.app.events.menuCommand, appKey.command)
    } else {
      const { key: keyCode, modifiers } = appKey
      host.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
      host.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    }
  })

  view.setBounds(rounded(bounds))
  host.contentView.addChildView(view)
  return view
}

const STILL_TIMEOUT_MS = 1000

/** Hides the view and returns a still picture of it to show in its place, or null when there is none. */
export async function hideWithStill(view: WebContentsView): Promise<string | null> {
  let still: string | null = null
  try {
    // A window that is not painting (minimised, or hidden) may never answer, and the caller waits for this.
    const image = await Promise.race([
      view.webContents.capturePage(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), STILL_TIMEOUT_MS))
    ])
    if (image && !image.isEmpty())
      still = `data:image/jpeg;base64,${image.toJPEG(75).toString('base64')}`
  } catch {
    // No still picture: the tab shows its plain background while an overlay is open.
  }
  view.setVisible(false)
  return still
}
