<script setup lang="ts">
/** A floating panel in the top layer, placed next to an anchor (an element or a rect). Escape and a press outside emit `dismiss`; focus returns to the opener. */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { Align, Side } from '../behaviors/anchored-position'
import { useAnchoredPosition, type Anchor } from '../behaviors/useAnchoredPosition'
import { useDismissLayer, type DismissReason } from '../behaviors/useDismissLayer'
import { useFocusReturn } from '../behaviors/useFocusReturn'

const props = withDefaults(
  defineProps<{
    open: boolean
    /** What it is placed next to: an element, or a rect such as the pointer or a text selection. */
    anchor: Anchor
    side?: Side
    align?: Align
    offset?: number
    /** The accessible name. */
    label?: string
    /** `dialog` for content, `menu` for a menu. Default `dialog`. */
    role?: string
  }>(),
  { side: 'bottom', align: 'start', role: 'dialog' }
)
const emit = defineEmits<{ dismiss: [reason: DismissReason] }>()

const el = ref<HTMLElement | null>(null)
const { position, update } = useAnchoredPosition(el, () => ({
  side: props.side,
  align: props.align,
  offset: props.offset
}))
const style = computed(() => ({ left: `${position.value.left}px`, top: `${position.value.top}px` }))

useFocusReturn(() => props.open)
useDismissLayer({
  open: () => props.open,
  // Pressing the element that opened it is the opener's to handle (usually a toggle).
  elements: () => [el.value, props.anchor instanceof HTMLElement ? props.anchor : null],
  onDismiss: (reason) => emit('dismiss', reason)
})

async function sync(): Promise<void> {
  const popover = el.value
  if (!popover) return
  if (props.open) {
    if (!popover.matches(':popover-open')) popover.showPopover()
    await update(props.anchor)
  } else if (popover.matches(':popover-open')) {
    popover.hidePopover()
  }
}

// An open popover follows its anchor when the window resizes or something scrolls.
function reposition(): void {
  if (props.open) void update(props.anchor)
}

onMounted(() => {
  window.addEventListener('resize', reposition)
  window.addEventListener('scroll', reposition, true)
  void sync()
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', reposition)
  window.removeEventListener('scroll', reposition, true)
})
watch(() => [props.open, props.anchor, props.side, props.align, props.offset], sync)
defineExpose({ el })
</script>

<template>
  <div ref="el" class="st-popover" popover="manual" :role="role" :aria-label="label" :style="style">
    <slot />
  </div>
</template>
