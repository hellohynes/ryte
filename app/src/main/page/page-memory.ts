import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

import type { WebContents } from 'electron'

import {
  CAPTURE_SCRIPT,
  isEmptyState,
  parsePageState,
  restoreScript,
  STATE_WORLD_ID,
  type PageState
} from './page-state'

const SAVE_DELAY_MS = 1000
/** Pages that render late (a framework mounting after load) get a second put-back. */
const RESTORE_RETRY_MS = 500

type Contents = Pick<WebContents, 'executeJavaScriptInIsolatedWorld' | 'isDestroyed' | 'once'>

/**
 * What each open page showed when it was last seen (scroll, typed and picked values), so a page that sleeps,
 * reloads or comes back after Ryte restarts is put back as it was. Kept in memory per tab key and mirrored to a
 * file in the app data folder for tabs that are still open.
 */
export interface PageMemory {
  /** Reads the page's state and keeps it, unless the page is gone (`isLive` false) by the time it answers. */
  capture(key: string, contents: Contents, isLive: () => boolean): Promise<void>
  /** Captures the page every so often while `isShown`. Returns the function that stops it. */
  watch(key: string, contents: Contents, isLive: () => boolean, isShown: () => boolean): () => void
  /** Puts back what was kept for this key once the page has loaded. */
  restoreOnLoad(key: string, contents: Contents): void
  /** The tab closed. */
  forget(key: string): void
  /** Drops what was kept for every key with this prefix that is not among `keys`. */
  retain(prefix: string, keys: readonly string[]): void
  /** Writes the file now. */
  flush(): void
}

export function createPageMemory(file: string, captureEveryMs: number): PageMemory {
  const states = new Map<string, PageState>()
  try {
    if (existsSync(file)) {
      const saved = JSON.parse(readFileSync(file, 'utf8')) as { entries?: Record<string, unknown> }
      for (const [key, raw] of Object.entries(saved.entries ?? {})) {
        const state = parsePageState(raw)
        if (state) states.set(key, state)
      }
    }
  } catch {
    // An unreadable file means nothing was kept.
  }

  let timer: NodeJS.Timeout | null = null
  const write = (): void => {
    timer = null
    try {
      const tmp = `${file}.tmp`
      writeFileSync(tmp, JSON.stringify({ version: 1, entries: Object.fromEntries(states) }))
      renameSync(tmp, file)
    } catch {
      // Best effort: the memory still works for this run.
    }
  }
  const changed = (): void => {
    timer ??= setTimeout(write, SAVE_DELAY_MS)
    timer.unref()
  }
  const drop = (key: string): void => {
    if (states.delete(key)) changed()
  }

  const capture: PageMemory['capture'] = async (key, contents, isLive) => {
    if (contents.isDestroyed()) return
    let state: PageState | null = null
    try {
      state = parsePageState(
        await contents.executeJavaScriptInIsolatedWorld(STATE_WORLD_ID, [{ code: CAPTURE_SCRIPT }])
      )
    } catch {
      return
    }
    if (!state || !isLive()) return
    if (isEmptyState(state)) return drop(key)
    const before = states.get(key)
    if (before && JSON.stringify(before) === JSON.stringify(state)) return
    states.set(key, state)
    changed()
  }

  return {
    capture,
    watch(key, contents, isLive, isShown) {
      const every = setInterval(() => {
        if (isShown()) void capture(key, contents, isLive)
      }, captureEveryMs)
      every.unref()
      return () => clearInterval(every)
    },
    restoreOnLoad(key, contents) {
      const state = states.get(key)
      if (!state) return
      const code = restoreScript(state)
      const run = (): void => {
        if (!contents.isDestroyed())
          void contents
            .executeJavaScriptInIsolatedWorld(STATE_WORLD_ID, [{ code }])
            .catch(() => undefined)
      }
      contents.once('did-finish-load', () => {
        run()
        setTimeout(run, RESTORE_RETRY_MS).unref()
      })
    },
    forget: drop,
    retain(prefix, keys) {
      const wanted = new Set(keys.map((key) => prefix + key))
      for (const key of [...states.keys()])
        if (key.startsWith(prefix) && !wanted.has(key)) drop(key)
    },
    flush() {
      if (!timer) return
      clearTimeout(timer)
      write()
    }
  }
}
