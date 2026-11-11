import { type BrowserWindow, WebContentsView, type Session } from 'electron'

import { contract } from '../../contract'
import type { EmitTo } from '../contract/register'
import type { BlockedLog } from './page-blocked'
import { createPageLinkOpener, createRealInputGate, isOpenablePageLink } from './page-links'
import { appKeyFor } from './page-keys'

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

/** Refuses every permission, device and download the page asks for, and records each refusal. */
export function lockSession(ses: Session, log: BlockedLog): void {
  ses.setPermissionRequestHandler((_contents, permission, callback) => {
    log.add(`permission: ${permission}`)
    callback(false)
  })
  ses.setPermissionCheckHandler(() => false)
  ses.setDevicePermissionHandler(() => false)
  ses.on('will-download', (event, item) => {
    event.preventDefault()
    log.add(item.getURL())
  })
}

export interface LockedViewOptions {
  ses: Session
  host: BrowserWindow
  bounds: PageBounds
  log: BlockedLog
  emitTo: EmitTo
  /** Opens an address in the browser. The caller has already checked the kind of address. */
  openExternal: (url: string) => void
  /** Whether the page may load or move to this address itself. Anything else is a link or is blocked. */
  allowNavigation: (url: string, isMainFrame: boolean) => boolean
}

/**
 * The sandboxed view both kinds of page share: no preload, no Node, no devtools, no dialogs, no new windows. A link
 * opens in the browser only on a real click, Ryte's own shortcuts are handed to the app before the page sees
 * them, and the view is placed over `bounds` of the host window.
 */
export function createLockedView({
  ses,
  host,
  bounds,
  log,
  emitTo,
  openExternal,
  allowNavigation
}: LockedViewOptions): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools: false,
      disableDialogs: true,
      navigateOnDragDrop: false,
      webviewTag: false,
      autoplayPolicy: 'user-gesture-required'
    }
  })
  const contents = view.webContents
  // A page is shown on white, as a browser would, not through the window's translucent background.
  view.setBackgroundColor('#ffffff')
  contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
  // A link opens in the browser only when the person just clicked it, and the box itself never loads it.
  const gate = createRealInputGate()
  const openLink = createPageLinkOpener(gate, openExternal)
  contents.on('input-event', (_event, input) => {
    if (input.type === 'mouseUp') gate.note()
  })
  contents.setWindowOpenHandler(({ url }) => {
    if (!openLink(url)) log.add(url)
    return { action: 'deny' }
  })
  contents.on('will-frame-navigate', (event) => {
    // A frame inside the page may load the page's own files, and the page may move within what it was opened
    // from. Everything else is a link (opened only on a real click) or blocked.
    if (allowNavigation(event.url, event.isMainFrame)) return
    event.preventDefault()
    if (!event.isMainFrame || !isOpenablePageLink(event.url) || !openLink(event.url)) {
      log.add(event.url)
    }
  })
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'Enter' && !input.isAutoRepeat) gate.note()
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

/** Hides the view and returns a still picture of it to show in its place, or null when there is none. */
export async function hideWithStill(view: WebContentsView): Promise<string | null> {
  let still: string | null = null
  try {
    const image = await view.webContents.capturePage()
    if (!image.isEmpty()) still = `data:image/jpeg;base64,${image.toJPEG(75).toString('base64')}`
  } catch {
    // No still picture: the tab shows its plain background while an overlay is open.
  }
  view.setVisible(false)
  return still
}
