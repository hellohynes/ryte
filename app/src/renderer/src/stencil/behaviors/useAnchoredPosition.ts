import { nextTick, ref, type Ref } from 'vue'

import { placeFloating, type Placement, type PlacementInput, type Rect } from './anchored-position'

export type Anchor = HTMLElement | Rect | null | undefined

function rectOf(anchor: Anchor): Rect | null {
  if (!anchor) return null
  if (anchor instanceof HTMLElement) {
    const { x, y, width, height } = anchor.getBoundingClientRect()
    return { x, y, width, height }
  }
  return anchor
}

/**
 * Places a floating element next to an anchor. The anchor can be an element or a plain rect, such as
 * the pointer (a context menu) or a text selection (a comment popover). Call `update` after the
 * floating element is rendered so its size is known.
 */
export function useAnchoredPosition(
  floating: Ref<HTMLElement | null>,
  options: () => Omit<PlacementInput, 'anchor' | 'size' | 'viewport'> = () => ({})
): {
  position: Ref<Placement>
  update: (anchor: Anchor) => Promise<void>
} {
  const position = ref<Placement>({ left: 0, top: 0, side: options().side ?? 'bottom' })
  async function update(anchor: Anchor): Promise<void> {
    await nextTick()
    const rect = rectOf(anchor)
    const el = floating.value
    if (!rect || !el) return
    const { width, height } = el.getBoundingClientRect()
    position.value = placeFloating({
      ...options(),
      anchor: rect,
      size: { width, height },
      viewport: { width: window.innerWidth, height: window.innerHeight }
    })
  }
  return { position, update }
}
