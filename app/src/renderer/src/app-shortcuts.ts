export interface AppShortcutInput {
  key: string
  defaultPrevented?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  modalOpen?: boolean
}

export type AppShortcutAction =
  | { type: 'open-search' }
  | { type: 'open-file' }
  | { type: 'open-native-file' }
  | { type: 'open-settings' }
  | { type: 'toggle-sidebar' }
  | { type: 'focus-next-tab' }
  | { type: 'focus-previous-tab' }

function hasOnlyMeta(input: AppShortcutInput): boolean {
  return Boolean(input.metaKey && !input.altKey && !input.ctrlKey && !input.shiftKey)
}

function hasOnlyMetaShift(input: AppShortcutInput): boolean {
  return Boolean(input.metaKey && input.shiftKey && !input.altKey && !input.ctrlKey)
}

function hasOnlyControl(input: AppShortcutInput): boolean {
  return Boolean(input.ctrlKey && !input.metaKey && !input.altKey && !input.shiftKey)
}

function isBracketKey(input: AppShortcutInput, side: 'left' | 'right'): boolean {
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key
  return side === 'left' ? key === '[' || key === '{' : key === ']' || key === '}'
}

export function shouldScheduleControlShortcutBadges(input: AppShortcutInput): boolean {
  return Boolean(
    !input.defaultPrevented &&
    !input.modalOpen &&
    input.key === 'Control' &&
    !input.metaKey &&
    !input.altKey &&
    !input.shiftKey
  )
}

export function resolveAppShortcutAction(input: AppShortcutInput): AppShortcutAction | null {
  if (input.defaultPrevented || input.modalOpen) return null

  const key = input.key.toLowerCase()

  if (hasOnlyControl(input)) {
    if (key === '0') return { type: 'open-settings' }
    if (key === '/') return { type: 'open-search' }
    if (key === 't') return { type: 'toggle-sidebar' }
    if (key === 'o') return { type: 'open-native-file' }
    return null
  }

  if (hasOnlyMeta(input)) {
    if (key === 'b') return { type: 'toggle-sidebar' }
    if (key === 'k') return { type: 'open-search' }
    if (key === 'p') return { type: 'open-file' }
    if (key === 'o') return { type: 'open-native-file' }
    if (key === ',') return { type: 'open-settings' }
  }

  if (hasOnlyMetaShift(input)) {
    if (isBracketKey(input, 'right')) return { type: 'focus-next-tab' }
    if (isBracketKey(input, 'left')) return { type: 'focus-previous-tab' }
  }

  return null
}
