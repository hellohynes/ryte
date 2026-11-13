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
const CAPTURE_EVERY_MS = 30_000
/** Pages that render late (a framework mounting after load) get a second put-back. */
const RESTORE_RETRY_MS = 500
/** How long quitting waits for the showing pages to answer. */
const QUIT_CAPTURE_MS = 300

type Contents = Pick<
  WebContents,
  'executeJavaScriptInIsolatedWorld' | 'isDestroyed' | 'isLoading' | 'once'
>

export interface PageMemory {
  capture(key: string, contents: Contents, isLive: () => boolean): Promise<void>
  track(key: string, contents: Contents, isLive: () => boolean, isShown: () => boolean): () => void
  retain(prefix: string, keys: readonly string[]): void
  saveForQuit(): Promise<void>
}

/**
 * What each open page showed when it was last seen (scroll, typed and picked values), so a page that sleeps,
 * reloads or comes back after Ryte restarts is put back as it was. Kept in memory per tab key and mirrored to a
 * file in the app data folder for tabs that are still open.
 */
export function createPageMemory(file: string): PageMemory {
  const states = new Map<string, PageState>()
  // Keys whose page is still waiting to be put back: a capture then would read a blank page and wipe the state.
  const restoring = new Set<string>()
  const tracked = new Set<{ run: () => Promise<void>; isShown: () => boolean }>()
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
  const flush = (): void => {
    if (!timer) return
    clearTimeout(timer)
    write()
  }

  /** Reads the page's state and keeps it, unless the page is gone (`isLive` false) by the time it answers. */
  async function capture(key: string, contents: Contents, isLive: () => boolean): Promise<void> {
    if (contents.isDestroyed() || contents.isLoading() || restoring.has(key)) return
    let state: PageState | null = null
    try {
      state = parsePageState(
        await contents.executeJavaScriptInIsolatedWorld(STATE_WORLD_ID, [{ code: CAPTURE_SCRIPT }])
      )
    } catch {
      return
    }
    if (!state || !isLive()) return
    if (!isEmptyState(state)) states.set(key, state)
    else if (!states.delete(key)) return
    changed()
  }

  return {
    capture,
    /**
     * Follows a page: puts back what was kept for `key` once it has loaded, and reads it every 30 s while
     * `isShown`. Returns the function that stops following.
     */
    track(key: string, contents: Contents, isLive: () => boolean, isShown: () => boolean) {
      const state = states.get(key)
      const run = (code: string): void => {
        void contents
          .executeJavaScriptInIsolatedWorld(STATE_WORLD_ID, [{ code }])
          .catch(() => undefined)
      }
      if (state) {
        restoring.add(key)
        contents.once('did-finish-load', () => {
          run(restoreScript(state))
          setTimeout(() => {
            if (contents.isDestroyed()) return
            run(restoreScript(state, true))
            restoring.delete(key)
          }, RESTORE_RETRY_MS).unref()
        })
      }
      const entry = { run: () => capture(key, contents, isLive), isShown }
      tracked.add(entry)
      const every = setInterval(() => {
        if (isShown()) void entry.run()
      }, CAPTURE_EVERY_MS)
      every.unref()
      return () => {
        clearInterval(every)
        tracked.delete(entry)
        restoring.delete(key)
      }
    },
    /** Drops what was kept for every key with this prefix that is not among `keys`. */
    retain(prefix: string, keys: readonly string[]) {
      const wanted = new Set(keys)
      for (const key of [...states.keys()]) {
        if (key.startsWith(prefix) && !wanted.has(key)) {
          states.delete(key)
          changed()
        }
      }
    },
    /** Quitting: reads the pages that are showing, waits a moment at most, and writes the file. */
    async saveForQuit() {
      const showing = [...tracked].filter((entry) => entry.isShown()).map((entry) => entry.run())
      await Promise.race([
        Promise.all(showing),
        new Promise((resolve) => setTimeout(resolve, QUIT_CAPTURE_MS))
      ])
      flush()
    }
  }
}
