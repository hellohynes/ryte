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
import { appPageMemory } from './app-page-memory'
import type { PageMemory } from './page-memory'
import { createPageHandler, pageAddress, readOrCreateSalt, tokenOfNotesFolder } from './page-scheme'

export type { PageBounds }

export type PageShowResult = 'shown' | 'missing' | 'blocked' | 'too-large'

export interface PageBox {
  show(sender: WebContents, path: string, bounds: PageBounds): Promise<PageShowResult>
  setBounds(sender: WebContents, bounds: PageBounds): void
  hide(sender: WebContents): Promise<string | null>
  /** The page's tab went to the background: hides its view and keeps it, and its session, alive. */
  park(sender: WebContents, path: string): Promise<void>
  /** Destroys the page's view, if it has one, after keeping what it shows. The page's tab stays open (a reload). */
  close(sender: WebContents, path: string): Promise<void>
  /** The pages that have a tab open in this window: the view of any other page is destroyed. */
  retain(sender: WebContents, paths: readonly string[]): void
}

export interface PageBoxDependencies {
  getNotesRoot: () => string
  emitTo: EmitTo
  /** Opens an address in the browser. The caller has already checked the kind of address. */
  openExternal: (url: string) => void
  /** What each page showed, kept for coming back as it was. Asked for on first use. */
  memory?: () => PageMemory
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
  stopTracking: () => void
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
  openExternal,
  memory = appPageMemory
}: PageBoxDependencies): PageBox {
  // The notes folder is part of the key, so a tab at the same path in another folder does not take this one's state.
  const memoryKey = (path: string): string => `page:${getNotesRoot()}|${path}`

  // Each show and close takes a new number for its window. A show that finds its number changed while it
  // waited has been overtaken by a close or a newer show, and must not attach a view.
  const latest = new Map<number, number>()
  const bump = (senderId: number): number => {
    const next = (latest.get(senderId) ?? 0) + 1
    latest.set(senderId, next)
    return next
  }

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
    const { view, host, log, stopTracking } = page
    stopTracking()
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
        latest.delete(senderId)
        watchedWindows.delete(senderId)
      })
    }
    return host
  }

  // Keeps what the page shows, unless its tab has been closed or the page put to sleep by the time it answers.
  const keep = (senderId: number, path: string, page: OpenPage): Promise<void> =>
    memory().capture(
      memoryKey(path),
      page.view.webContents,
      () => kept.get(senderId, path) === page
    )

  const create = (
    sender: WebContents,
    host: BrowserWindow,
    path: string,
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
    const stopTracking = memory().track(
      memoryKey(path),
      view.webContents,
      () => kept.get(sender.id, path)?.view === view,
      () => kept.shown(sender.id)?.view === view
    )
    return { realPath, version, view, host, log, stopTracking }
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
      // Whatever it showed comes back on the new view.
      if (current) {
        await keep(sender.id, path, current)
        if (!isCurrent()) return 'blocked'
        kept.remove(sender.id, path)
      }
      // Reading or making the salt can fail, so it is inside the catch with the rest of the address.
      const address = await Promise.resolve()
        .then(() => pageAddress(getNotesRoot(), located.realPath, getSalt()))
        .catch(() => null)
      if (!address || !isCurrent()) return 'blocked'
      const page = create(sender, host, path, located.realPath, version, bounds)
      kept.add(sender.id, path, page)
      // The tab closed while the view was being made.
      if (!kept.isWanted(sender.id, path)) {
        kept.remove(sender.id, path)
        return 'blocked'
      }
      kept.present(sender.id, path, rounded(bounds))
      void page.view.webContents.loadURL(address).catch(() => undefined)
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
      await keep(sender.id, path, page)
    },
    async close(sender, path) {
      if (!watchedHost(sender)) return
      bump(sender.id)
      // A tab that is closed for good is cleaned up by `retain`; this is a reload, so the page comes back as it was.
      const page = kept.get(sender.id, path)
      if (page) await keep(sender.id, path, page)
      kept.remove(sender.id, path)
    },
    retain(sender, paths) {
      if (!watchedHost(sender)) return
      kept.retain(sender.id, paths)
      memory().retain('page:', paths.map(memoryKey))
    }
  }
}
