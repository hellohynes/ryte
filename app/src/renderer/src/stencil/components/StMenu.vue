<script setup lang="ts">
/** A menu in the top layer, anchored to an element or a rect such as the pointer. Arrows, Home, End, and typing move through its items; Tab and Escape close it; choosing an item emits `dismiss` with reason select. */
import { nextTick, ref, watch } from 'vue'

import type { Align, Side } from '../behaviors/anchored-position'
import { useRovingFocus } from '../behaviors/roving'
import { useTypeahead } from '../behaviors/typeahead'
import type { Anchor } from '../behaviors/useAnchoredPosition'
import type { DismissReason } from '../behaviors/useDismissLayer'
import StPopover from './StPopover.vue'

const props = defineProps<{
  open: boolean
  anchor: Anchor
  /** The accessible name. */
  label: string
  side?: Side
  align?: Align
}>()
const emit = defineEmits<{ dismiss: [reason: DismissReason | 'select' | 'tab'] }>()

const popover = ref<InstanceType<typeof StPopover> | null>(null)

function items(): HTMLElement[] {
  return [
    ...(popover.value?.el?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? [])
  ]
}

const current = (): number => Math.max(0, items().indexOf(document.activeElement as HTMLElement))
const roving = useRovingFocus(items, current, { orientation: 'vertical' })
const typeahead = useTypeahead(() => items().map((item) => item.textContent?.trim() ?? ''), current)

function onKeydown(event: KeyboardEvent): void {
  // Tab leaves the menu, like it does in the native one.
  if (event.key === 'Tab') {
    event.preventDefault()
    emit('dismiss', 'tab')
    return
  }
  if (roving.onKeydown(event)) return
  const { consumed, index } = typeahead.onKeydown(event)
  // A space typed while jumping ("sort b") must not also press the focused item.
  if (consumed) event.preventDefault()
  if (index !== null) items()[index]?.focus()
}

// A choice closes the menu; the item's own handler has already run.
function onClick(event: MouseEvent): void {
  if (event.target instanceof Element && event.target.closest('[role^="menuitem"]')) {
    emit('dismiss', 'select')
  }
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    await nextTick()
    items()[0]?.focus()
  },
  { immediate: true }
)
</script>

<template>
  <StPopover
    ref="popover"
    class="st-menu"
    role="menu"
    :open="open"
    :anchor="anchor"
    :label="label"
    :side="side"
    :align="align"
    :offset="0"
    @dismiss="emit('dismiss', $event)"
    @keydown="onKeydown"
    @click="onClick"
    @contextmenu.prevent
  >
    <slot />
  </StPopover>
</template>
