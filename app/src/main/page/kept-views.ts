import type { WebContents, WebContentsView } from 'electron'

import type { BlockedLog } from './page-blocked'
import { createKeptViewPool, type KeptViewPool, type PoolMember } from './kept-view-pool'

/** How long a parked view stays visible for a show that is on its way before it is hidden regardless. */
const HIDE_FALLBACK_MS = 1000

interface ViewBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface KeptView {
  view: Pick<WebContentsView, 'setBounds' | 'setVisible'> & {
    webContents: Pick<WebContents, 'setAudioMuted' | 'isDestroyed' | 'getOSProcessId'>
  }
  log: Pick<BlockedLog, 'pause' | 'resume'>
}

interface WindowViews<T> {
  items: Map<string, T>
  /** When each view was last shown, in the pool's shared order. */
  stamps: Map<string, number>
  shown: string | null
  /** The key of the latest show that has not presented yet: a tab switch in flight. */
  pending: string | null
  /** The keys that have a tab open, as last reported by the window. Null until it has reported. */
  wanted: Set<string> | null
}

export interface KeptViewsOptions<T> {
  /** The budget and ceiling these views count toward, shared with the other boxes. Default: a pool of their own. */
  pool?: KeptViewPool
  /** Tears one view down for good. Called once per view, never for a view that is only hidden. */
  destroy: (item: T) => void
}

/**
 * The locked views a window keeps alive while their tabs are in the background, so a page keeps its scroll
 * position and its storage across a tab switch. At most one is shown per window. When all the views in the
 * pool together use more memory than its budget, or there are more than its ceiling, the least recently shown
 * ones go to sleep (are destroyed, and load again when their tab comes back); a view is also destroyed when its
 * tab is gone. This only does the bookkeeping: what a view is made of, and how it is torn down, belongs to the
 * caller.
 */
export interface KeptViews<T extends KeptView> {
  get(senderId: number, key: string): T | undefined
  /** The view that is showing now, if any. */
  shown(senderId: number): T | undefined
  /** Notes that a tab for this key is open, ahead of the window's next report. */
  claim(senderId: number, key: string): void
  /** False once the window has reported its tabs and this key is not among them. */
  isWanted(senderId: number, key: string): boolean
  /** Keeps a new view as the most recently shown and puts to sleep what the budget or the ceiling pushes out. */
  add(senderId: number, key: string, item: T): void
  /** Shows this view over `bounds`, hides every other one of the window. */
  present(senderId: number, key: string, bounds: ViewBounds): boolean
  /** Hides a view for its tab going to the background and keeps it. */
  park(senderId: number, key: string): T | undefined
  setBounds(senderId: number, bounds: ViewBounds): void
  remove(senderId: number, key: string): void
  /** The window's tabs: every view whose key is not among them is destroyed. */
  retain(senderId: number, keys: readonly string[]): void
  /** Destroys every view for which `matches` is true, in any window. */
  removeWhere(matches: (item: T) => boolean): void
  /** The window is gone: destroys all its views. */
  dropWindow(senderId: number): void
  size(senderId: number): number
}

/** A view in the background shows nothing, makes no sound and reports nothing to the page in front. */
function hold(item: KeptView): void {
  item.view.setVisible(false)
  item.log.pause()
  if (!item.view.webContents.isDestroyed()) item.view.webContents.setAudioMuted(true)
}

export function createKeptViews<T extends KeptView>({
  pool = createKeptViewPool(),
  destroy
}: KeptViewsOptions<T>): KeptViews<T> {
  const windows = new Map<number, WindowViews<T>>()

  const windowOf = (senderId: number): WindowViews<T> => {
    let views = windows.get(senderId)
    if (!views) {
      views = { items: new Map(), stamps: new Map(), shown: null, pending: null, wanted: null }
      windows.set(senderId, views)
    }
    return views
  }

  const drop = (views: WindowViews<T>, key: string): void => {
    const item = views.items.get(key)
    if (!item) return
    views.items.delete(key)
    views.stamps.delete(key)
    if (views.shown === key) views.shown = null
    destroy(item)
    pool.sync()
  }

  const member: PoolMember = {
    size: () => [...windows.values()].reduce((sum, views) => sum + views.items.size, 0),
    collect(out, protect) {
      for (const views of windows.values()) {
        for (const [key, item] of views.items) {
          const contents = item.view.webContents
          out.push({
            key: String(out.length),
            pid: contents.isDestroyed() ? 0 : contents.getOSProcessId(),
            order: views.stamps.get(key) ?? 0,
            shown: key === views.shown || item === protect,
            sleep: () => drop(views, key)
          })
        }
      }
    }
  }

  return {
    get: (senderId: number, key: string): T | undefined => windows.get(senderId)?.items.get(key),

    /** The view that is showing now, if any. */
    shown: (senderId: number): T | undefined => {
      const views = windows.get(senderId)
      return views?.shown ? views.items.get(views.shown) : undefined
    },

    /** Notes that a tab for this key is open, ahead of the window's next report. */
    claim: (senderId: number, key: string): void => {
      const views = windowOf(senderId)
      views.wanted?.add(key)
      views.pending = key
    },

    /** False once the window has reported its tabs and this key is not among them. */
    isWanted: (senderId: number, key: string): boolean => {
      const wanted = windows.get(senderId)?.wanted
      return !wanted || wanted.has(key)
    },

    /** Keeps a new view as the most recently shown and puts to sleep what the budget or the ceiling pushes out. */
    add(senderId: number, key: string, item: T): void {
      const views = windowOf(senderId)
      views.items.set(key, item)
      views.stamps.set(key, pool.stamp())
      pool.join(member)
      pool.sweep(item)
      pool.sync()
    },

    /** Shows this view over `bounds`, hides every other one of the window. */
    present(senderId: number, key: string, bounds: ViewBounds): boolean {
      const views = windows.get(senderId)
      const item = views?.items.get(key)
      if (!views || !item) return false
      for (const [other, kept] of views.items) {
        if (other !== key) hold(kept)
      }
      item.view.setBounds(bounds)
      item.view.setVisible(true)
      item.log.resume()
      if (!item.view.webContents.isDestroyed()) item.view.webContents.setAudioMuted(false)
      views.stamps.set(key, pool.stamp())
      views.shown = key
      if (views.pending === key) views.pending = null
      return true
    },

    /** Hides a view for its tab going to the background and keeps it. */
    park(senderId: number, key: string): T | undefined {
      const views = windows.get(senderId)
      const item = views?.items.get(key)
      if (!views || !item) return undefined
      if (views.shown === key) views.shown = null
      if (views.pending !== null && views.pending !== key) {
        // Another tab's show is on its way and hides this view when it presents, so the stage is never empty in
        // between. If that show never presents (it failed), this view is hidden after a moment anyway.
        const timer = setTimeout(() => {
          if (views.items.get(key) === item && views.shown !== key) hold(item)
        }, HIDE_FALLBACK_MS)
        timer.unref()
      } else {
        hold(item)
      }
      pool.sweep(item)
      return item
    },

    setBounds(senderId: number, bounds: ViewBounds): void {
      const views = windows.get(senderId)
      if (views?.shown) views.items.get(views.shown)?.view.setBounds(bounds)
    },

    remove(senderId: number, key: string): void {
      const views = windows.get(senderId)
      if (!views) return
      if (views.pending === key) views.pending = null
      drop(views, key)
    },

    /** The window's tabs: every view whose key is not among them is destroyed. */
    retain(senderId: number, keys: readonly string[]): void {
      const views = windowOf(senderId)
      const wanted = new Set(keys)
      views.wanted = wanted
      for (const key of [...views.items.keys()]) {
        if (!wanted.has(key)) drop(views, key)
      }
    },

    /** Destroys every view for which `matches` is true, in any window. */
    removeWhere(matches: (item: T) => boolean): void {
      for (const views of windows.values()) {
        for (const [key, item] of [...views.items]) {
          if (matches(item)) drop(views, key)
        }
      }
    },

    /** The window is gone: destroys all its views. */
    dropWindow(senderId: number): void {
      const views = windows.get(senderId)
      if (!views) return
      for (const key of [...views.items.keys()]) drop(views, key)
      windows.delete(senderId)
      pool.sync()
    },

    size: (senderId: number): number => windows.get(senderId)?.items.size ?? 0
  }
}
