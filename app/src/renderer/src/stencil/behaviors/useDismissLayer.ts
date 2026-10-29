import { onScopeDispose, toValue, watch, type MaybeRefOrGetter } from 'vue'

import { layers } from './layer-stack'

export type DismissReason = 'escape' | 'outside'

export interface DismissLayerOptions {
  open: MaybeRefOrGetter<boolean>
  onDismiss: (reason: DismissReason) => void
  /** The layer's own elements. A pointer press inside any of them is not "outside". */
  elements?: () => Array<HTMLElement | null | undefined>
  /** Read when the key is pressed. Default true. */
  escape?: MaybeRefOrGetter<boolean>
  /** Read when the pointer is pressed. Default true. */
  outside?: MaybeRefOrGetter<boolean>
}

/**
 * Registers an open overlay on the shared layer stack. While it is the top layer, Escape and a
 * pointer press outside its elements ask it to dismiss. It never closes itself: `onDismiss` decides.
 */
export function useDismissLayer(options: DismissLayerOptions): void {
  const id = Symbol('layer')
  let attached = false

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || event.defaultPrevented || !layers.isTop(id)) return
    if (!toValue(options.escape ?? true)) return
    // Stops the browser's own close request (a native dialog) and any outer handler.
    event.preventDefault()
    event.stopPropagation()
    options.onDismiss('escape')
  }

  function onPointerDown(event: PointerEvent): void {
    if (!layers.isTop(id) || !toValue(options.outside ?? true)) return
    const target = event.target
    if (target instanceof Node && (options.elements?.() ?? []).some((el) => el?.contains(target)))
      return
    options.onDismiss('outside')
  }

  function attach(): void {
    if (attached) return
    attached = true
    layers.push(id)
    document.addEventListener('keydown', onKeydown)
    document.addEventListener('pointerdown', onPointerDown, true)
  }

  function detach(): void {
    if (!attached) return
    attached = false
    layers.remove(id)
    document.removeEventListener('keydown', onKeydown)
    document.removeEventListener('pointerdown', onPointerDown, true)
  }

  watch(
    () => toValue(options.open),
    (open) => (open ? attach() : detach()),
    { immediate: true, flush: 'sync' }
  )
  onScopeDispose(detach)
}
