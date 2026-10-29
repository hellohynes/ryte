/**
 * Arrow-key movement through a row or column of items (menu, tabs, radio group, toolbar), with Home
 * and End. The pure part is `rovingTarget`; `useRovingFocus` adds the DOM.
 */
export type Orientation = 'vertical' | 'horizontal' | 'both'

export interface RovingOptions {
  /** Which arrow keys move. Default `vertical`. */
  orientation?: Orientation
  /** Wrap past either end. Default true. */
  wrap?: boolean
}

/** The index a key moves to, or null when the key is not a navigation key. */
export function rovingTarget(
  key: string,
  index: number,
  count: number,
  { orientation = 'vertical', wrap = true }: RovingOptions = {}
): number | null {
  if (count <= 0) return null
  const next =
    (orientation !== 'horizontal' && key === 'ArrowDown') ||
    (orientation !== 'vertical' && key === 'ArrowRight')
  const previous =
    (orientation !== 'horizontal' && key === 'ArrowUp') ||
    (orientation !== 'vertical' && key === 'ArrowLeft')
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (next) return wrap ? (index + 1) % count : Math.min(index + 1, count - 1)
  if (previous) return wrap ? (index - 1 + count) % count : Math.max(index - 1, 0)
  return null
}

export interface RovingFocus {
  /** Handles a keydown on the group. Returns true when it moved focus. */
  onKeydown(event: KeyboardEvent): boolean
  /** The tabindex for an item: only the current one is a tab stop. */
  tabindexFor(index: number): 0 | -1
}

/**
 * Keeps a group to a single tab stop and moves focus with the arrow keys. `current` is the index
 * that holds the tab stop; `onMove` is told where focus went (a radio group selects as it goes).
 */
export function useRovingFocus(
  items: () => HTMLElement[],
  current: () => number,
  options: RovingOptions & { onMove?: (index: number) => void } = {}
): RovingFocus {
  return {
    onKeydown(event) {
      if (event.altKey || event.ctrlKey || event.metaKey) return false
      const list = items()
      const from = list.indexOf(document.activeElement as HTMLElement)
      const target = rovingTarget(event.key, from === -1 ? current() : from, list.length, options)
      if (target === null) return false
      event.preventDefault()
      list[target]?.focus()
      options.onMove?.(target)
      return true
    },
    tabindexFor: (index) => (index === current() ? 0 : -1)
  }
}
