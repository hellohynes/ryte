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
import { createKeptViews } from './kept-views'
import { isOwnPageAddress, isOwnPageMove } from './page-moves'
import {
  parseScroll,
  READ_SCROLL_SCRIPT,
  restoreScrollScript,
  type PageScroll
} from './page-scroll'
import { createPageFolderHandler, type PageFolders } from './page-scheme'

export type { PageBounds }

export type PageShowResult = 'shown' | 'missing' | 'blocked' | 'too-large'

export interface PageBox {
  show(sender: WebContents, path: string, bounds: PageBounds): Promise<PageShowResult>
  setBounds(sender: WebContents, bounds: PageBounds): void
  hide(sender: WebContents): Promise<string | null>
  /** The page's tab went to the background: hides its view and keeps it, and its session, alive. */
  park(sender: WebContents, path: string): Promise<void>
  /** Destroys the page's view, if it has one. */
  close(sender: WebContents, path: string): void
  /** The pages that have a tab open in this window: the view of any other page is destroyed. */
  retain(sender: WebContents, paths: readonly string[]): void
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
  /** Size, modification time and file identity when the page loaded: a different file on return means a fresh load. */
  version: string
  view: WebContentsView
  host: BrowserWindow
  ses: Session
  log: BlockedLog
}

/**
 * The locked view for an HTML page: a separate sandboxed view in its own in-memory session, with no preload and
 * no Node. It loads only from the page's folder through `ryte-page`, never `ryte-file`, and refuses the
 * network, other files, windows, downloads and permissions. A window shows one page at a time and keeps the
 * pages of its other tabs alive, hidden, up to a cap, so each keeps its scroll position and its storage (each
 * page has its own session, shared with nothing) until its tab closes or it is pushed out.
 */
export function createPageBox({
  folders,
  getNotesRoot,
  emitTo,
  openExternal
}: PageBoxDependencies): PageBox {
  // Each show and close takes a new number for its window. A show that finds its number changed while it
  // waited has been overtaken by a close or a newer show, and must not attach a view.
  const latest = new Map<number, number>()
  const bump = (senderId: number): number => {
    const next = (latest.get(senderId) ?? 0) + 1
    latest.set(senderId, next)
    return next
  }

  // Where a page was scrolled to when its tab went to the background, for a page that has to load again after
  // being pushed out. Kept per window and only for pages that still have a tab.
  const scrolls = new Map<number, Map<string, PageScroll>>()
  const watchedWindows = new Set<number>()

  const destroy = (page: OpenPage): void => {
    const { view, host, ses, log } = page
    folders.close(page.id)
    log.stop()
    if (!host.isDestroyed()) host.contentView.removeChildView(view)
    if (!view.webContents.isDestroyed()) view.webContents.close()
    // Electron cannot destroy a session, so its storage is cleared by hand. The filter stays, denying everything,
    // because a closing page can still send a request while it unloads.
    ses.webRequest.onBeforeRequest((_details, callback) => callback({ cancel: true }))
    ses.protocol.unhandle(PAGE_SCHEME)
    void ses.clearStorageData()
  }

  const kept = createKeptViews<OpenPage>({ destroy })

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
        scrolls.delete(senderId)
        latest.delete(senderId)
        watchedWindows.delete(senderId)
      })
    }
    return host
  }

  const rememberScroll = (senderId: number, path: string, scroll: PageScroll): void => {
    let forWindow = scrolls.get(senderId)
    if (!forWindow) scrolls.set(senderId, (forWindow = new Map()))
    forWindow.set(path, scroll)
  }

  const readScroll = async (page: OpenPage): Promise<PageScroll | null> => {
    const contents = page.view.webContents
    if (contents.isDestroyed()) return null
    try {
      return parseScroll(await contents.executeJavaScript(READ_SCROLL_SCRIPT))
    } catch {
      return null
    }
  }

  const create = async (
    sender: WebContents,
    host: BrowserWindow,
    realPath: string,
    version: string,
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
    return { id, realPath, version, view, host, ses, log }
  }

  return {
    async show(sender, path, bounds) {
      const host = watchedHost(sender)
      if (!host) return 'blocked'
      const turn = bump(sender.id)
      const isCurrent = (): boolean => latest.get(sender.id) === turn
      kept.claim(sender.id, path)
      const located = await locateNoteFile(path, getNotesRoot(), (extension) =>
        isHtmlPagePath(`x.${extension}`)
      )
      if (!isCurrent()) return 'blocked'
      if (!located.ok) {
        kept.remove(sender.id, path)
        return located.reason
      }
      if (located.size > MAX_PAGE_TEXT_BYTES) {
        kept.remove(sender.id, path)
        return 'too-large'
      }

      // Size, modification time and file identity: a copy that keeps the size and the time is still another file.
      const version = `${located.size}:${located.mtimeMs}:${located.dev}:${located.ino}`
      const current = kept.get(sender.id, path)
      if (current && current.realPath === located.realPath && current.version === version) {
        kept.present(sender.id, path, rounded(bounds))
        return 'shown'
      }
      // A different file under the same name, or the file changed while its tab was in the background: a fresh load.
      if (current) {
        kept.remove(sender.id, path)
        scrolls.get(sender.id)?.delete(path)
      }
      const page = await create(sender, host, located.realPath, version, bounds, isCurrent)
      if (!page) return 'blocked'
      kept.add(sender.id, path, page)
      // The tab closed while the view was being made.
      if (!kept.isWanted(sender.id, path)) {
        kept.remove(sender.id, path)
        return 'blocked'
      }
      kept.present(sender.id, path, rounded(bounds))
      const scroll = scrolls.get(sender.id)?.get(path)
      const contents = page.view.webContents
      if (scroll) {
        contents.once('did-finish-load', () => {
          if (!contents.isDestroyed())
            void contents.executeJavaScript(restoreScrollScript(scroll)).catch(() => undefined)
        })
      }
      void contents.loadURL(pageUrl(page.id, basename(located.realPath))).catch(() => undefined)
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
    async park(sender, path) {
      const page = kept.park(sender.id, path)
      if (!page) return
      const scroll = await readScroll(page)
      if (scroll && kept.get(sender.id, path) === page) rememberScroll(sender.id, path, scroll)
    },
    close(sender, path) {
      if (!watchedHost(sender)) return
      bump(sender.id)
      kept.remove(sender.id, path)
      scrolls.get(sender.id)?.delete(path)
    },
    retain(sender, paths) {
      if (!watchedHost(sender)) return
      kept.retain(sender.id, paths)
      const forWindow = scrolls.get(sender.id)
      if (!forWindow) return
      const wanted = new Set(paths)
      for (const path of [...forWindow.keys()]) if (!wanted.has(path)) forWindow.delete(path)
    }
  }
}
