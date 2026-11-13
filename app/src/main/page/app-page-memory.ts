import { join } from 'node:path'

import { app } from 'electron'

import { createPageMemory, type PageMemory } from './page-memory'

let memory: PageMemory | null = null

/**
 * The app's one page memory, shared by the page box and the local box and kept in `page-state.json` in the app
 * data folder. It is made the first time it is asked for, so a box can be built without the app data folder.
 */
export function appPageMemory(): PageMemory {
  if (memory) return memory
  const made = createPageMemory(join(app.getPath('userData'), 'page-state.json'))
  let saved = false
  // Quit waits a moment for the showing pages to be read, then carries on.
  app.on('before-quit', (event) => {
    if (saved) return
    saved = true
    event.preventDefault()
    void made.saveForQuit().finally(() => app.quit())
  })
  return (memory = made)
}
