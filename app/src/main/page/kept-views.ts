import type { WebContentsView } from 'electron'

/** How many locked views one window keeps alive at once, shown or hidden. */
export const MAX_KEPT_VIEWS = 4

interface ViewBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface KeptView {
  view: Pick<WebContentsView, 'setBounds' | 'setVisible'>
}

interface WindowViews<T> {
  /** Least recently shown first. */
  items: Map<string, T>
  shown: string | null
  /** The keys that have a tab open, as last reported by the window. Null until it has reported. */
  wanted: Set<string> | null
}

export interface KeptViewsOptions<T> {
  cap?: number
  /** Tears one view down for good. Called once per view, never for a view that is only hidden. */
  destroy: (item: T) => void
}

/**
 * The locked views a window keeps alive while their tabs are in the background, so a page keeps its scroll
 * position and its storage across a tab switch. At most one is shown. Past the cap the least recently shown
 * view is destroyed; a view is also destroyed when its tab is gone. This only does the bookkeeping: what a view
 * is made of, and how it is torn down, belongs to the caller.
 */
export interface KeptViews<T extends KeptView> {
  get(senderId: number, key: string): T | undefined
  /** The view that is showing now, if any. */
  shown(senderId: number): T | undefined
  /** Notes that a tab for this key is open, ahead of the window's next report. */
  claim(senderId: number, key: string): void
  /** False once the window has reported its tabs and this key is not among them. */
  isWanted(senderId: number, key: string): boolean
  /** Keeps a new view as the most recently shown and destroys what the cap pushes out. */
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

export function createKeptViews<T extends KeptView>({
  cap = MAX_KEPT_VIEWS,
  destroy
}: KeptViewsOptions<T>): KeptViews<T> {
  const windows = new Map<number, WindowViews<T>>()

  const windowOf = (senderId: number): WindowViews<T> => {
    let views = windows.get(senderId)
    if (!views) {
      views = { items: new Map(), shown: null, wanted: null }
      windows.set(senderId, views)
    }
    return views
  }

  const drop = (views: WindowViews<T>, key: string): void => {
    const item = views.items.get(key)
    if (!item) return
    views.items.delete(key)
    if (views.shown === key) views.shown = null
    destroy(item)
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
      windowOf(senderId).wanted?.add(key)
    },

    /** False once the window has reported its tabs and this key is not among them. */
    isWanted: (senderId: number, key: string): boolean => {
      const wanted = windows.get(senderId)?.wanted
      return !wanted || wanted.has(key)
    },

    /** Keeps a new view as the most recently shown and destroys what the cap pushes out. */
    add(senderId: number, key: string, item: T): void {
      const views = windowOf(senderId)
      views.items.set(key, item)
      while (views.items.size > cap) {
        const victim = [...views.items.keys()].find((k) => k !== key && k !== views.shown)
        if (victim === undefined) break
        drop(views, victim)
      }
    },

    /** Shows this view over `bounds`, hides every other one of the window. */
    present(senderId: number, key: string, bounds: ViewBounds): boolean {
      const views = windows.get(senderId)
      const item = views?.items.get(key)
      if (!views || !item) return false
      for (const [other, kept] of views.items) {
        if (other !== key) kept.view.setVisible(false)
      }
      item.view.setBounds(bounds)
      item.view.setVisible(true)
      views.items.delete(key)
      views.items.set(key, item)
      views.shown = key
      return true
    },

    /** Hides a view for its tab going to the background and keeps it. */
    park(senderId: number, key: string): T | undefined {
      const views = windows.get(senderId)
      const item = views?.items.get(key)
      if (!views || !item) return undefined
      item.view.setVisible(false)
      if (views.shown === key) views.shown = null
      return item
    },

    setBounds(senderId: number, bounds: ViewBounds): void {
      const views = windows.get(senderId)
      if (views?.shown) views.items.get(views.shown)?.view.setBounds(bounds)
    },

    remove(senderId: number, key: string): void {
      const views = windows.get(senderId)
      if (views) drop(views, key)
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
    },

    size: (senderId: number): number => windows.get(senderId)?.items.size ?? 0
  }
}
