import { dirname, basename } from 'node:path'

import { BrowserWindow, session, WebContentsView, type Session, type WebContents } from 'electron'

import { contract } from '../../contract'
import { isHtmlPagePath, MAX_PAGE_TEXT_BYTES, PAGE_SCHEME, pageUrl } from '../../shared/page-box'
import type { EmitTo } from '../contract/register'
import { locateNoteFile } from '../viewer/note-files'
import { createBlockedLog, type BlockedLog } from './page-blocked'
import { createPageLinkOpener, createRealInputGate, isOpenablePageLink } from './page-links'
import { appKeyFor } from './page-keys'
import { isOwnPageAddress, isOwnPageMove } from './page-moves'
import { createPageFolderHandler, type PageFolders } from './page-scheme'

export interface PageBounds {
  x: number
  y: number
  width: number
  height: number
}

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

const rounded = (bounds: PageBounds): PageBounds => ({
  x: Math.round(bounds.x),
  y: Math.round(bounds.y),
  width: Math.max(0, Math.round(bounds.width)),
  height: Math.max(0, Math.round(bounds.height))
})

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
    // Electron cannot destroy a session, so the page's handlers and storage are cleared by hand.
    ses.webRequest.onBeforeRequest(null)
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
      // A frame inside the page may load the page's own files, and the page may move to another page of its
      // folder. Everything else is a link (opened only on a real click) or blocked.
      if (event.isMainFrame ? isOwnPageMove(event.url, id) : isOwnPageAddress(event.url, id)) return
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
      let still: string | null = null
      try {
        const image = await page.view.webContents.capturePage()
        if (!image.isEmpty())
          still = `data:image/jpeg;base64,${image.toJPEG(75).toString('base64')}`
      } catch {
        // No still picture: the tab shows its plain background while an overlay is open.
      }
      page.view.setVisible(false)
      return still
    },
    close(sender) {
      bump(sender.id)
      destroy(sender.id)
    }
  }
}
