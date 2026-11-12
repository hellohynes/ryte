import type { InputEvent, WebContents } from 'electron'

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
    if (isRealPress(input)) gate.note()
  })
}

/** A mouse-up, or the key press that activates a control: Enter or Space (a physical key arrives as rawKeyDown). */
export function isRealPress(input: InputEvent): boolean {
  if (input.type === 'mouseUp') return true
  if ('isAutoRepeat' in input && input.isAutoRepeat) return false
  if (!('key' in input)) return false
  const activates = input.key === 'Enter' || input.key === ' '
  return (
    ((input.type === 'keyDown' || input.type === 'rawKeyDown') && activates) ||
    (input.type === 'keyUp' && input.key === ' ')
  )
}

/** Whether the window just had a real click, Enter or Space that no call has used yet. Using it spends it. */
export function recentRealInput(contents: WebContents): boolean {
  return gates.get(contents)?.consume() ?? false
}
