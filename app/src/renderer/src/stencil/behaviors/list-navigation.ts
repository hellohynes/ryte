import { computed, ref, type Ref } from 'vue'

import { rovingTarget } from './roving'

const PAGE = 10

/** Where a key moves the active item of a list: arrows, Home and End, PageUp and PageDown. */
export function listTarget(key: string, active: number, count: number, loop = true): number | null {
  if (count <= 0) return null
  if (key === 'PageDown') return Math.min(active + PAGE, count - 1)
  if (key === 'PageUp') return Math.max(active - PAGE, 0)
  return rovingTarget(key, active, count, { orientation: 'vertical', wrap: loop })
}

/** The scrollTop that brings an item fully into a scroller, or the current one when it already is. */
export function scrollTopToReveal(state: {
  scrollTop: number
  viewportHeight: number
  itemTop: number
  itemHeight: number
  margin?: number
}): number {
  const margin = state.margin ?? 8
  const itemBottom = state.itemTop + state.itemHeight
  if (state.itemTop - margin < state.scrollTop) return Math.max(0, state.itemTop - margin)
  if (itemBottom + margin > state.scrollTop + state.viewportHeight) {
    return itemBottom + margin - state.viewportHeight
  }
  return state.scrollTop
}

export interface ListNavigation {
  active: Ref<number>
  /** The id of the active option, for `aria-activedescendant`. */
  activeId: Ref<string | undefined>
  /** Handles a keydown on the input that owns the list. Returns true when it moved. */
  onKeydown(event: KeyboardEvent): boolean
  set(index: number): void
}

/**
 * The active option of a list that keeps focus elsewhere (a combobox input). The list itself is
 * driven by `aria-activedescendant`; `reveal` scrolls the active option into view.
 */
export function useListNavigation(options: {
  count: () => number
  optionId: (index: number) => string
  loop?: boolean
  reveal?: (index: number) => void
}): ListNavigation {
  const active = ref(0)
  const set = (index: number): void => {
    const count = options.count()
    active.value = count === 0 ? 0 : Math.min(Math.max(index, 0), count - 1)
    options.reveal?.(active.value)
  }
  return {
    active,
    activeId: computed(() => (options.count() > 0 ? options.optionId(active.value) : undefined)),
    onKeydown(event) {
      const target = listTarget(event.key, active.value, options.count(), options.loop)
      if (target === null) return false
      event.preventDefault()
      set(target)
      return true
    },
    set
  }
}
