import { join } from 'node:path'

import { app } from 'electron'

import { createPageMemory, type PageMemory } from './page-memory'

const CAPTURE_EVERY_MS = 30_000

// A hidden test launch of an unpackaged app may shorten the interval, so the built-app check does not wait 30 s.
const testMs = Number(process.env['RYTE_TEST_CAPTURE_MS'])
const testing = !app.isPackaged && process.env['RYTE_TEST_HIDDEN'] === '1'

let memory: PageMemory | null = null

// The file and the app's data folder are only touched the first time a page is used, not when a box is made.
const real = (): PageMemory => {
  if (memory) return memory
  const made = createPageMemory(
    join(app.getPath('userData'), 'page-state.json'),
    testing && Number.isFinite(testMs) && testMs > 0 ? testMs : CAPTURE_EVERY_MS
  )
  app.once('before-quit', () => made.flush())
  return (memory = made)
}

const shared = new Proxy({} as PageMemory, {
  get: (_target, name) => real()[name as keyof PageMemory]
})

/** The app's one page memory, shared by the page box and the local box and kept in `page-state.json` in the app data folder. */
export const appPageMemory = (): PageMemory => shared
