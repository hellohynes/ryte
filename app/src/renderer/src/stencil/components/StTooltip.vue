<script setup lang="ts">
/** A short label for a control. Shows after a hover pause or on keyboard focus and hides on Escape. The default slot receives { describedby } for the control. */
import { onBeforeUnmount, ref, useId } from 'vue'

import { placeFloating, type Placement, type Side } from '../behaviors/anchored-position'

const props = withDefaults(defineProps<{ text: string; side?: Side; delay?: number }>(), {
  side: 'top',
  delay: 400
})

defineSlots<{
  /** Put `describedby` on the control so assistive technology reads the tooltip with it. */
  default(props: { describedby: string }): unknown
}>()

const id = useId()
const anchor = ref<HTMLElement | null>(null)
const tip = ref<HTMLElement | null>(null)
const position = ref<Placement>({ left: 0, top: 0, side: props.side })
let timer: number | undefined

function show(): void {
  const trigger = anchor.value
  const el = tip.value
  if (!trigger || !el) return
  el.showPopover()
  const { x, y, width, height } = trigger.getBoundingClientRect()
  const size = el.getBoundingClientRect()
  position.value = placeFloating({
    anchor: { x, y, width, height },
    size: { width: size.width, height: size.height },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    side: props.side,
    align: 'center'
  })
}

function hide(): void {
  window.clearTimeout(timer)
  if (tip.value?.matches(':popover-open')) tip.value.hidePopover()
}

// Hovering waits a moment so passing over a control stays quiet; keyboard focus shows it at once.
function onPointerEnter(): void {
  window.clearTimeout(timer)
  timer = window.setTimeout(show, props.delay)
}

function onFocusIn(event: FocusEvent): void {
  if (event.target instanceof Element && event.target.matches(':focus-visible')) show()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') hide()
}

onBeforeUnmount(hide)
</script>

<template>
  <span
    ref="anchor"
    class="st-tooltip-anchor"
    @pointerenter="onPointerEnter"
    @pointerleave="hide"
    @pointerdown="hide"
    @focusin="onFocusIn"
    @focusout="hide"
    @keydown="onKeydown"
  >
    <slot :describedby="id" />
    <span
      :id="id"
      ref="tip"
      class="st-tooltip"
      popover="manual"
      role="tooltip"
      :style="{ left: `${position.left}px`, top: `${position.top}px` }"
    >
      {{ text }}
    </span>
  </span>
</template>
