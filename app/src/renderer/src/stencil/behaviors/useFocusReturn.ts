import { nextTick, onScopeDispose, toValue, watch, type MaybeRefOrGetter } from 'vue'

/**
 * Remembers what had focus when an overlay opened and gives it back when the overlay closes. Falls
 * back to `fallback` when the opener is gone, so focus never drops to the page body.
 */
export function useFocusReturn(
  open: MaybeRefOrGetter<boolean>,
  fallback?: () => HTMLElement | null | undefined
): void {
  let opener: HTMLElement | null = null

  function restore(): void {
    const target = opener?.isConnected ? opener : fallback?.()
    opener = null
    target?.focus?.()
  }

  watch(
    () => toValue(open),
    (isOpen) => {
      if (isOpen) {
        opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      } else if (opener || fallback) {
        void nextTick(restore)
      }
    },
    // Sync, so the opener is read before the overlay moves focus into itself.
    { immediate: true, flush: 'sync' }
  )
  onScopeDispose(() => {
    if (toValue(open)) restore()
  })
}
