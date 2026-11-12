import { randomBytes } from 'node:crypto'

import {
  BrowserWindow,
  session,
  type Session,
  type WebContents,
  type WebContentsView
} from 'electron'

import { contract } from '../../contract'
import type { LocalAddress } from '../../shared/local-address'
import type { EmitTo } from '../contract/register'
import {
  createLockedView,
  hideWithStill,
  lockSession,
  rounded,
  type PageBounds
} from './locked-view'
import { createKeptViews } from './kept-views'
import { createBlockedLog, type BlockedLog } from './page-blocked'
import { isAllowedLocalRequest, isSameLocalOrigin } from './local-rules'

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

interface OpenLocal {
  url: string
  origin: string
  view: WebContentsView
  host: BrowserWindow
  ses: Session
  log: BlockedLog
}

/**
 * The locked view for an approved local address: the same sandboxed view as an HTML page, in its own in-memory
 * session that can reach only that origin (and its live-reload socket). A window shows one local page at a time
 * and keeps the pages of its other tabs alive, hidden, up to a cap, until their tabs close or an approval is
 * removed. The caller has already checked that the origin is approved.
 */
export function createLocalBox({ emitTo, openExternal }: LocalBoxDependencies): LocalBox {
  // Each show and close takes a new number for its window, so a show overtaken while it waited attaches nothing.
  const latest = new Map<number, number>()
  const bump = (senderId: number): number => {
    const next = (latest.get(senderId) ?? 0) + 1
    latest.set(senderId, next)
    return next
  }
  const watchedWindows = new Set<number>()

  const destroy = (page: OpenLocal): void => {
    const { view, host, ses, log } = page
    log.stop()
    if (!host.isDestroyed()) host.contentView.removeChildView(view)
    if (!view.webContents.isDestroyed()) view.webContents.close()
    // Electron cannot destroy a session, so its storage is cleared by hand. The filter stays, denying everything,
    // because a closing page can still send a request while it unloads.
    ses.webRequest.onBeforeRequest((_details, callback) => callback({ cancel: true }))
    void ses.clearStorageData()
  }

  const kept = createKeptViews<OpenLocal>({ destroy })

  const watchWindow = (senderId: number, host: BrowserWindow): void => {
    if (watchedWindows.has(senderId)) return
    watchedWindows.add(senderId)
    host.once('closed', () => {
      kept.dropWindow(senderId)
      latest.delete(senderId)
      watchedWindows.delete(senderId)
    })
  }

  return {
    async show(sender, address, bounds) {
      const turn = bump(sender.id)
      const host = BrowserWindow.fromWebContents(sender)
      if (!host) return 'blocked'
      watchWindow(sender.id, host)
      kept.claim(sender.id, address.url)

      if (kept.present(sender.id, address.url, rounded(bounds))) return 'shown'

      // No `persist:` prefix and a new name every time, so the session lives in memory, is shared with no other
      // page, and is gone with this one.
      const ses = session.fromPartition(`ryte-local-${randomBytes(8).toString('hex')}`)
      // Connection hints that `webRequest` never sees (preconnect, WebRTC over TCP) go to a closed local port.
      // Chromium never sends loopback through a proxy, so the approved origin is not affected.
      await ses.setProxy({ proxyRules: 'http://127.0.0.1:9' })
      if (latest.get(sender.id) !== turn) return 'blocked'

      const { origin } = address
      const log = createBlockedLog((state) => emitTo(sender, contract.page.events.blocked, state))
      ses.webRequest.onBeforeRequest((details, callback) => {
        const allowed = isAllowedLocalRequest(details.url, origin)
        if (!allowed) log.add(details.url)
        callback({ cancel: !allowed })
      })
      lockSession(ses, log)
      const view = createLockedView({
        ses,
        host,
        bounds,
        log,
        emitTo,
        openExternal,
        // The page may move around its own origin, as local apps change pages; anything else is a link.
        allowNavigation: (url) => isSameLocalOrigin(url, origin)
      })
      kept.add(sender.id, address.url, { url: address.url, origin, view, host, ses, log })
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
      bump(sender.id)
      kept.remove(sender.id, url)
    },
    retain(sender, urls) {
      kept.retain(sender.id, urls)
    },
    closeOrigin(origin) {
      kept.removeWhere((page) => page.origin === origin)
    }
  }
}
