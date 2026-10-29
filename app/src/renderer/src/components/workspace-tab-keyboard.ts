export const WORKSPACE_TABPANEL_ID = 'workspace-tabpanel'

export type WorkspaceTabDirection = 'next' | 'previous'

export type WorkspaceTabKeyInput = {
  key: string
  code?: string
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  repeat?: boolean
}

export type WorkspaceTabKeyboardAction =
  | { type: 'activate'; tabId: string }
  | { type: 'close'; tabId: string }

export type WorkspaceTabGlobalShortcutAction =
  | { type: 'activate'; tabId: string }
  | { type: 'close-active' }

function keyName(input: WorkspaceTabKeyInput): string {
  return input.key.length === 1 ? input.key.toLowerCase() : input.key
}

function hasCommandModifier(input: WorkspaceTabKeyInput): boolean {
  return Boolean(input.altKey || input.ctrlKey || input.metaKey)
}

function isBracketKey(input: WorkspaceTabKeyInput, side: 'left' | 'right'): boolean {
  if (input.code === (side === 'left' ? 'BracketLeft' : 'BracketRight')) return true
  const key = keyName(input)
  return side === 'left' ? key === '[' || key === '{' : key === ']' || key === '}'
}

export function getWorkspaceTabDomId(tabId: string): string {
  const encoded = Array.from(tabId)
    .map((char) => {
      if (/^[A-Za-z0-9_-]$/.test(char)) return char
      return `-${char.codePointAt(0)?.toString(16) ?? '0'}-`
    })
    .join('')
  return `workspace-tab-${encoded || 'unknown'}`
}

export function getWorkspaceTabIndex(tabIds: readonly string[], tabId: string | null): number {
  if (tabIds.length === 0) return -1
  const index = tabId ? tabIds.indexOf(tabId) : -1
  return index >= 0 ? index : 0
}

export function getAdjacentWorkspaceTabId(
  tabIds: readonly string[],
  tabId: string | null,
  direction: WorkspaceTabDirection
): string | null {
  if (tabIds.length === 0) return null
  const tabIndex = tabId ? tabIds.indexOf(tabId) : -1
  if (tabIndex === -1) {
    return direction === 'next' ? (tabIds[0] ?? null) : (tabIds.at(-1) ?? null)
  }
  const currentIndex = getWorkspaceTabIndex(tabIds, tabId)
  const offset = direction === 'next' ? 1 : -1
  const nextIndex = (currentIndex + offset + tabIds.length) % tabIds.length
  return tabIds[nextIndex] ?? null
}

export function getEdgeWorkspaceTabId(
  tabIds: readonly string[],
  edge: 'first' | 'last'
): string | null {
  if (tabIds.length === 0) return null
  return edge === 'first' ? (tabIds[0] ?? null) : (tabIds.at(-1) ?? null)
}

export function getNumberedWorkspaceTabId(
  tabIds: readonly string[],
  numericKey: string
): string | null {
  if (!/^[1-9]$/.test(numericKey) || tabIds.length === 0) return null
  const digit = Number(numericKey)
  if (digit === 9) return tabIds.at(-1) ?? null
  return tabIds[digit - 1] ?? null
}

export function getCloseFallbackWorkspaceTabId(
  tabIds: readonly string[],
  closedTabId: string
): string | null {
  const closedIndex = tabIds.indexOf(closedTabId)
  if (closedIndex === -1) return null
  const remainingTabIds = tabIds.filter((tabId) => tabId !== closedTabId)
  return remainingTabIds[closedIndex] ?? remainingTabIds[closedIndex - 1] ?? null
}

export function resolveTablistKeyboardAction(
  input: WorkspaceTabKeyInput,
  tabIds: readonly string[],
  focusedTabId: string
): WorkspaceTabKeyboardAction | null {
  if (tabIds.length === 0 || hasCommandModifier(input)) return null

  switch (keyName(input)) {
    case 'ArrowLeft': {
      const tabId = getAdjacentWorkspaceTabId(tabIds, focusedTabId, 'previous')
      return tabId ? { type: 'activate', tabId } : null
    }
    case 'ArrowRight': {
      const tabId = getAdjacentWorkspaceTabId(tabIds, focusedTabId, 'next')
      return tabId ? { type: 'activate', tabId } : null
    }
    case 'Home': {
      const tabId = getEdgeWorkspaceTabId(tabIds, 'first')
      return tabId ? { type: 'activate', tabId } : null
    }
    case 'End': {
      const tabId = getEdgeWorkspaceTabId(tabIds, 'last')
      return tabId ? { type: 'activate', tabId } : null
    }
    case 'Enter':
    case ' ':
    case 'Spacebar':
      return { type: 'activate', tabId: focusedTabId }
    case 'Backspace':
    case 'Delete':
      return input.repeat ? null : { type: 'close', tabId: focusedTabId }
    default:
      return null
  }
}

export function resolveGlobalWorkspaceTabShortcut(
  input: WorkspaceTabKeyInput,
  tabIds: readonly string[],
  activeTabId: string | null
): WorkspaceTabGlobalShortcutAction | null {
  if (tabIds.length === 0) return null

  const key = keyName(input)
  const hasOnlyMeta = Boolean(input.metaKey && !input.altKey && !input.ctrlKey && !input.shiftKey)

  if (input.metaKey && input.shiftKey && !input.altKey && !input.ctrlKey) {
    if (isBracketKey(input, 'left')) {
      const tabId = getAdjacentWorkspaceTabId(tabIds, activeTabId, 'previous')
      return tabId ? { type: 'activate', tabId } : null
    }
    if (isBracketKey(input, 'right')) {
      const tabId = getAdjacentWorkspaceTabId(tabIds, activeTabId, 'next')
      return tabId ? { type: 'activate', tabId } : null
    }
  }

  if (hasOnlyMeta && /^[1-9]$/.test(key)) {
    const tabId = getNumberedWorkspaceTabId(tabIds, key)
    return tabId ? { type: 'activate', tabId } : null
  }

  if (hasOnlyMeta && key === 'w' && !input.repeat) {
    return activeTabId ? { type: 'close-active' } : null
  }

  return null
}
