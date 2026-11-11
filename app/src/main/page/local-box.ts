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
import { createBlockedLog, type BlockedLog } from './page-blocked'
import { isAllowedLocalRequest, isSameLocalOrigin } from './local-rules'

export type LocalShowResult = 'shown' | 'blocked'

export interface LocalBox {
  show(sender: WebContents, address: LocalAddress, bounds: PageBounds): Promise<LocalShowResult>
  setBounds(sender: WebContents, bounds: PageBounds): void
  hide(sender: WebContents): Promise<string | null>
  close(sender: WebContents): void
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
  onHostClosed: () => void
}

/**
 * The locked view for an approved local address: the same sandboxed view as an HTML page, in its own in-memory
 * session that can reach only that origin (and its live-reload socket). One local page is open per app window.
 * The caller has already checked that the origin is approved.
 */
export function createLocalBox({ emitTo, openExternal }: LocalBoxDependencies): LocalBox {
  const open = new Map<number, OpenLocal>()
  // Each show and close takes a new number for its window, so a show overtaken while it waited attaches nothing.
  const latest = new Map<number, number>()
  const bump = (senderId: number): number => {
    const next = (latest.get(senderId) ?? 0) + 1
    latest.set(senderId, next)
    return next
  }

  const destroy = (senderId: number): void => {
    const page = open.get(senderId)
    if (!page) return
    open.delete(senderId)
    const { view, host, ses, log } = page
    log.stop()
    host.removeListener('closed', page.onHostClosed)
    if (!host.isDestroyed()) host.contentView.removeChildView(view)
    if (!view.webContents.isDestroyed()) view.webContents.close()
    // Electron cannot destroy a session, so its storage is cleared by hand. The filter stays, denying everything,
    // because a closing page can still send a request while it unloads.
    ses.webRequest.onBeforeRequest((_details, callback) => callback({ cancel: true }))
    void ses.clearStorageData()
  }

  return {
    async show(sender, address, bounds) {
      const turn = bump(sender.id)
      const host = BrowserWindow.fromWebContents(sender)
      if (!host) return 'blocked'

      const current = open.get(sender.id)
      if (current && current.url === address.url) {
        current.view.setBounds(rounded(bounds))
        current.view.setVisible(true)
        return 'shown'
      }
      destroy(sender.id)

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
      const onHostClosed = (): void => {
        destroy(sender.id)
        latest.delete(sender.id)
      }
      host.once('closed', onHostClosed)
      open.set(sender.id, { url: address.url, origin, view, host, ses, log, onHostClosed })
      void view.webContents.loadURL(address.url).catch(() => undefined)
      return 'shown'
    },
    setBounds(sender, bounds) {
      open.get(sender.id)?.view.setBounds(rounded(bounds))
    },
    async hide(sender) {
      const page = open.get(sender.id)
      return page ? hideWithStill(page.view) : null
    },
    close(sender) {
      bump(sender.id)
      destroy(sender.id)
    },
    closeOrigin(origin) {
      for (const [senderId, page] of [...open]) {
        if (page.origin === origin) destroy(senderId)
      }
    }
  }
}
