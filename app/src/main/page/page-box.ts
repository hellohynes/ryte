import { join } from 'node:path'

import { app, BrowserWindow, type Session, type WebContentsView, type WebContents } from 'electron'

import { contract } from '../../contract'
import { isHtmlPagePath, MAX_PAGE_TEXT_BYTES, PAGE_SCHEME } from '../../shared/page-box'
import type { EmitTo } from '../contract/register'
import { locateNoteFile } from '../viewer/note-files'
import { createBlockedLog, type BlockedLog } from './page-blocked'
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
import { isSubframeAllowed, pageMoveVerdict } from './page-moves'
import {
  parseScroll,
  READ_SCROLL_SCRIPT,
  restoreScrollScript,
  type PageScroll
} from './page-scroll'
import { createPageHandler, pageAddress, readOrCreateSalt, tokenOfNotesFolder } from './page-scheme'

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
  getNotesRoot: () => string
  emitTo: EmitTo
  /** Opens an address in the browser. The caller has already checked the kind of address. */
  openExternal: (url: string) => void
}

/** The name of the one lasting session of every HTML page: what a page saves stays across sleep, reload and restart. */
const PAGES_SESSION = 'ryte-pages'

interface OpenPage {
  realPath: string
  /** Size, modification time and file identity when the page loaded: a different file on return means a fresh load. */
  version: string
  view: WebContentsView
  host: BrowserWindow
  log: BlockedLog
}

/**
 * The view for an HTML page: a separate sandboxed view with no preload and no Node, in the one lasting session
 * of all pages. It loads its files, and any other file of the notes folder, through `ryte-page`, and otherwise
 * behaves like a browser tab: internet, clipboard, downloads, dialogs and saved data. A window shows one page
 * at a time and keeps the pages of its other tabs alive, hidden, so each keeps its scroll position until its tab
 * closes or it is put to sleep to stay within the memory budget; what it saved stays in the session.
 */
export function createPageBox({
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
  // being put to sleep. Kept per window and only for pages that still have a tab.
  const scrolls = new Map<number, Map<string, PageScroll>>()
  const watchedWindows = new Set<number>()

  // The session is shared and lasting, so closing or sleeping a page only closes its view. The session is made
  // the first time a page opens.
  let salt: string | null = null
  const getSalt = (): string =>
    (salt ??= readOrCreateSalt(join(app.getPath('userData'), 'page-token-salt')))
  let pagesSession: Session | null = null
  const pageSession = (): Session => {
    if (pagesSession) return pagesSession
    const ses = lastingSession(PAGES_SESSION)
    ses.protocol.handle(PAGE_SCHEME, createPageHandler(getNotesRoot, getSalt))
    setUpPageSession(ses)
    return (pagesSession = ses)
  }

  const destroy = (page: OpenPage): void => {
    const { view, host, log } = page
    log.stop()
    if (!host.isDestroyed()) host.contentView.removeChildView(view)
    if (!view.webContents.isDestroyed()) view.webContents.close()
    // What the page saved must reach the disk before its view is gone.
    void pageSession().flushStorageData()
  }

  const kept = createKeptViews<OpenPage>({ destroy, pool: appKeptViewPool })

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

  const create = (
    sender: WebContents,
    host: BrowserWindow,
    realPath: string,
    version: string,
    bounds: PageBounds
  ): OpenPage => {
    const log: BlockedLog = createBlockedLog((state) =>
      emitTo(sender, contract.page.events.blocked, state)
    )
    const view = createPageView({
      ses: pageSession(),
      host,
      bounds,
      log,
      emitTo,
      openExternal,
      // A frame may load anything but Ryte's own surfaces. The page may move to another HTML page, which takes the
      // token of its own folder so its saved data stays with that folder.
      allowNavigation: (url, isMainFrame) =>
        isMainFrame
          ? pageMoveVerdict(url, (file) => tokenOfNotesFolder(getNotesRoot(), file, getSalt()))
          : isSubframeAllowed(url)
    })
    return { realPath, version, view, host, log }
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
      const address = await pageAddress(getNotesRoot(), located.realPath, getSalt()).catch(
        () => null
      )
      if (!address || !isCurrent()) return 'blocked'
      const page = create(sender, host, located.realPath, version, bounds)
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
      void contents.loadURL(address).catch(() => undefined)
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
