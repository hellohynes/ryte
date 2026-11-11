import { dirname, basename } from 'node:path'

import {
  BrowserWindow,
  session,
  type Session,
  type WebContentsView,
  type WebContents
} from 'electron'

import { contract } from '../../contract'
import { isHtmlPagePath, MAX_PAGE_TEXT_BYTES, PAGE_SCHEME, pageUrl } from '../../shared/page-box'
import type { EmitTo } from '../contract/register'
import { locateNoteFile } from '../viewer/note-files'
import { createBlockedLog, type BlockedLog } from './page-blocked'
import {
  createLockedView,
  hideWithStill,
  lockSession,
  rounded,
  type PageBounds
} from './locked-view'
import { isOwnPageAddress, isOwnPageMove } from './page-moves'
import { createPageFolderHandler, type PageFolders } from './page-scheme'

export type { PageBounds }

export type PageShowResult = 'shown' | 'missing' | 'blocked' | 'too-large'

export interface PageBox {
  show(sender: WebContents, path: string, bounds: PageBounds): Promise<PageShowResult>
  setBounds(sender: WebContents, bounds: PageBounds): void
  hide(sender: WebContents): Promise<string | null>
  close(sender: WebContents): void
}

export interface PageBoxDependencies {
  folders: PageFolders
  getNotesRoot: () => string
  emitTo: EmitTo
  /** Opens an address in the browser. The caller has already checked the kind of address. */
  openExternal: (url: string) => void
}

interface OpenPage {
  id: string
  realPath: string
  view: WebContentsView
  host: BrowserWindow
  ses: Session
  log: BlockedLog
  onHostClosed: () => void
}

/**
 * The locked view for an HTML page: a separate sandboxed view in its own in-memory session, with no preload and
 * no Node. It loads only from the page's folder through `ryte-page`, never `ryte-file`, and refuses the
 * network, other files, windows, downloads and permissions. One page is open per app window.
 */
export function createPageBox({
  folders,
  getNotesRoot,
  emitTo,
  openExternal
}: PageBoxDependencies): PageBox {
  const open = new Map<number, OpenPage>()
  // Each show and close takes a new number for its window. A show that finds its number changed while it
  // waited has been overtaken by a close or a newer show, and must not attach a view.
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
    folders.close(page.id)
    const { view, host, ses, log } = page
    log.stop()
    host.removeListener('closed', page.onHostClosed)
    if (!host.isDestroyed()) host.contentView.removeChildView(view)
    if (!view.webContents.isDestroyed()) view.webContents.close()
    // Electron cannot destroy a session, so its storage is cleared by hand. The filter stays, denying everything,
    // because a closing page can still send a request while it unloads.
    ses.webRequest.onBeforeRequest((_details, callback) => callback({ cancel: true }))
    ses.protocol.unhandle(PAGE_SCHEME)
    void ses.clearStorageData()
  }

  const create = async (
    sender: WebContents,
    host: BrowserWindow,
    realPath: string,
    bounds: PageBounds,
    isCurrent: () => boolean
  ): Promise<OpenPage | null> => {
    const id = folders.open(dirname(realPath))
    // No `persist:` prefix, so the session lives in memory and is gone with the page.
    const ses = session.fromPartition(`ryte-page-${id}`)
    // Nothing in the page may reach the network, including connection hints that `webRequest` never sees
    // (preconnect, WebRTC over TCP): they go to a closed local port. `ryte-page` is answered in-process and
    // never uses the proxy.
    await ses.setProxy({ proxyRules: 'http://127.0.0.1:9' })
    if (!isCurrent()) {
      folders.close(id)
      return null
    }
    const log: BlockedLog = createBlockedLog((state) =>
      emitTo(sender, contract.page.events.blocked, state)
    )

    ses.protocol.handle(PAGE_SCHEME, createPageFolderHandler(folders))
    ses.webRequest.onBeforeRequest((details, callback) => {
      const allowed = isOwnPageAddress(details.url, id)
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
      // A page may move to another HTML page of its folder; a frame may load the folder's own files.
      allowNavigation: (url, isMainFrame) =>
        isMainFrame ? isOwnPageMove(url, id) : isOwnPageAddress(url, id)
    })
    const onHostClosed = (): void => {
      destroy(sender.id)
      latest.delete(sender.id)
    }
    host.once('closed', onHostClosed)
    return { id, realPath, view, host, ses, log, onHostClosed }
  }

  return {
    async show(sender, path, bounds) {
      const turn = bump(sender.id)
      const isCurrent = (): boolean => latest.get(sender.id) === turn
      const located = await locateNoteFile(path, getNotesRoot(), (extension) =>
        isHtmlPagePath(`x.${extension}`)
      )
      if (!isCurrent()) return 'blocked'
      if (!located.ok) return located.reason
      if (located.size > MAX_PAGE_TEXT_BYTES) return 'too-large'
      const host = BrowserWindow.fromWebContents(sender)
      if (!host) return 'blocked'

      const current = open.get(sender.id)
      if (current && current.realPath === located.realPath) {
        current.view.setBounds(rounded(bounds))
        current.view.setVisible(true)
        return 'shown'
      }
      destroy(sender.id)
      const page = await create(sender, host, located.realPath, bounds, isCurrent)
      if (!page) return 'blocked'
      open.set(sender.id, page)
      void page.view.webContents
        .loadURL(pageUrl(page.id, basename(located.realPath)))
        .catch(() => undefined)
      return 'shown'
    },
    setBounds(sender, bounds) {
      open.get(sender.id)?.view.setBounds(rounded(bounds))
    },
    async hide(sender) {
      const page = open.get(sender.id)
      if (!page) return null
      return hideWithStill(page.view)
    },
    close(sender) {
      bump(sender.id)
      destroy(sender.id)
    }
  }
}
