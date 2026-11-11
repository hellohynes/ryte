import type { WebContents } from 'electron'

import { createRealInputGate, type RealInputGate } from './page/page-links'

const gates = new WeakMap<WebContents, RealInputGate>()

/**
 * Remembers the latest real click, Enter or Space in a window, as the operating system delivered it. A script in
 * the window cannot fake one. It never calls `preventDefault`, so every shortcut works as before.
 */
export function watchRealInput(contents: WebContents): void {
  const gate = createRealInputGate()
  gates.set(contents, gate)
  // `input-event` sees every click and key the window is sent, real or injected through the debugging port, and
  // cannot prevent any of them. (`before-input-event` is not raised for keys injected that way.)
  contents.on('input-event', (_event, input) => {
    if (input.type === 'mouseUp') {
      gate.note()
    } else if (!('isAutoRepeat' in input && input.isAutoRepeat) && 'key' in input) {
      const activates = input.key === 'Enter' || input.key === ' '
      if (
        (input.type === 'keyDown' && activates) ||
        (input.type === 'keyUp' && input.key === ' ')
      ) {
        gate.note()
      }
    }
  })
}

/** Whether the window just had a real click, Enter or Space that no call has used yet. Using it spends it. */
export function recentRealInput(contents: WebContents): boolean {
  return gates.get(contents)?.consume() ?? false
}
