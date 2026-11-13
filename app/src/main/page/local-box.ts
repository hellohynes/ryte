import { BrowserWindow, type Session, type WebContents, type WebContentsView } from 'electron'

import { contract } from '../../contract'
import { parseLocalAddress, type LocalAddress } from '../../shared/local-address'
import type { EmitTo } from '../contract/register'
import {
  createPageView,
  hideWithStill,
  lastingSession,
  rounded,
  setUpPageSession,
  type PageBounds
} from './page-view'
import { createKeptViews } from './kept-views'
import { appKeptViewPool } from './sleep-limits'
import { createBlockedLog, type BlockedLog } from './page-blocked'
import { isSubframeAllowed } from './page-moves'

export type LocalShowResult = 'shown' | 'blocked'

export interface LocalBox {
  show(sender: WebContents, address: LocalAddress, bounds: PageBounds): Promise<LocalShowResult>
  setBounds(sender: WebContents, bounds: PageBounds): void
  hide(sender: WebContents): Promise<string | null>
  /** The address's tab went to the background: hides its view and keeps it, and its session, alive. */
  park(sender: WebContents, url: string): void
  /** Destroys the address's view, if it has one. */
  close(sender: WebContents, url: string): void
  /** The addresses that have a tab open in this window: the view of any other address is destroyed. */
  retain(sender: WebContents, urls: readonly string[]): void
  /** Closes every open view of this origin, in any window. */
  closeOrigin(origin: string): void
}

export interface LocalBoxDependencies {
  emitTo: EmitTo
  /** Opens an address in the browser. The caller has already checked the kind of address. */
  openExternal: (url: string) => void
}

/** The name of the one lasting session of every local address: storage is kept per origin, as in a browser. */
const LOCAL_SESSION = 'ryte-local'

interface OpenLocal {
  url: string
  origin: string
  view: WebContentsView
  host: BrowserWindow
  log: BlockedLog
}

/**
 * The view for an approved local address: the same sandboxed view as an HTML page, in its own lasting session,
 * and otherwise a normal browser tab. A window shows one local page at a time and keeps the pages of its other
 * tabs alive, hidden, until their tabs close, an approval is removed, or they are put to sleep to stay within the
 * memory budget. The caller has already checked that the origin is approved.
 */
export function createLocalBox({ emitTo, openExternal }: LocalBoxDependencies): LocalBox {
  const watchedWindows = new Set<number>()

  // The session is shared and lasting, so closing or sleeping a page only closes its view. The session is made
  // the first time a local page opens.
  let localSession: Session | null = null
  const sessionForPages = (): Session => {
    if (localSession) return localSession
    const ses = lastingSession(LOCAL_SESSION)
    setUpPageSession(ses)
    return (localSession = ses)
  }

  const destroy = (page: OpenLocal): void => {
    const { view, host, log } = page
    log.stop()
    if (!host.isDestroyed()) host.contentView.removeChildView(view)
    if (!view.webContents.isDestroyed()) view.webContents.close()
    // What the page saved must reach the disk before its view is gone.
    void sessionForPages().flushStorageData()
  }

  const kept = createKeptViews<OpenLocal>({ destroy, pool: appKeptViewPool })

  // The window a call came from, with its bookkeeping set to be dropped when it closes. Every call that keeps
  // something per window goes through this first, so a window that never shows a page leaves nothing behind.
  const watchedHost = (sender: WebContents): BrowserWindow | null => {
    const host = BrowserWindow.fromWebContents(sender)
    if (!host) return null
    const senderId = sender.id
    if (!watchedWindows.has(senderId)) {
      watchedWindows.add(senderId)
      host.once('closed', () => {
        kept.dropWindow(senderId)
        watchedWindows.delete(senderId)
      })
    }
    return host
  }

  return {
    async show(sender, address, bounds) {
      const host = watchedHost(sender)
      if (!host) return 'blocked'
      kept.claim(sender.id, address.url)

      if (kept.present(sender.id, address.url, rounded(bounds))) return 'shown'

      const { origin } = address
      const log = createBlockedLog((state) => emitTo(sender, contract.page.events.blocked, state))
      const view = createPageView({
        ses: sessionForPages(),
        host,
        bounds,
        log,
        emitTo,
        openExternal,
        // The page may move around its own origin, as local apps change pages; anything else is a link. A frame
        // may load anything but Ryte's own surfaces.
        allowNavigation: (url, isMainFrame) =>
          isMainFrame ? parseLocalAddress(url)?.origin === origin : isSubframeAllowed(url)
      })
      kept.add(sender.id, address.url, { url: address.url, origin, view, host, log })
      // The tab closed while the view was being made.
      if (!kept.isWanted(sender.id, address.url)) {
        kept.remove(sender.id, address.url)
        return 'blocked'
      }
      kept.present(sender.id, address.url, rounded(bounds))
      void view.webContents.loadURL(address.url).catch(() => undefined)
      return 'shown'
    },
    setBounds(sender, bounds) {
      kept.setBounds(sender.id, rounded(bounds))
    },
    async hide(sender) {
      // Only the page that is showing has a picture to give; a page in the background has nothing to cover.
      const page = kept.shown(sender.id)
      return page ? hideWithStill(page.view) : null
    },
    park(sender, url) {
      kept.park(sender.id, url)
    },
    close(sender, url) {
      if (!watchedHost(sender)) return
      kept.remove(sender.id, url)
    },
    retain(sender, urls) {
      if (!watchedHost(sender)) return
      kept.retain(sender.id, urls)
    },
    closeOrigin(origin) {
      kept.removeWhere((page) => page.origin === origin)
    }
  }
}
