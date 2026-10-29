<script setup lang="ts">
/** The region that shows toasts. Render it once near the root; fire toasts with `toast()` from toast-store. */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { activeToasts, dismissToast, type Toast } from '../toast-store'
import StButton from './StButton.vue'
import StIconButton from './StIconButton.vue'

const el = ref<HTMLElement | null>(null)
const timers = new Map<number, number>()

function arm(item: Toast): void {
  if (item.duration === null || timers.has(item.id)) return
  timers.set(
    item.id,
    window.setTimeout(() => dismiss(item.id), item.duration)
  )
}

function pause(id: number): void {
  window.clearTimeout(timers.get(id))
  timers.delete(id)
}

function dismiss(id: number): void {
  pause(id)
  dismissToast(id)
}

function runAction(item: Toast): void {
  item.action?.onSelect()
  dismiss(item.id)
}

// The region lives in the top layer only while it has something to show.
watch(
  () => activeToasts.value.length,
  async (count) => {
    await nextTick()
    const region = el.value
    if (!region) return
    if (count > 0 && !region.matches(':popover-open')) region.showPopover()
    if (count === 0 && region.matches(':popover-open')) region.hidePopover()
  },
  { immediate: true }
)
watch(activeToasts, (list) => list.forEach(arm), { immediate: true, deep: true })

onMounted(() => activeToasts.value.forEach(arm))
onBeforeUnmount(() => timers.forEach((timer) => window.clearTimeout(timer)))
</script>

<template>
  <div ref="el" class="st-toaster" popover="manual" aria-live="polite">
    <div
      v-for="item in activeToasts"
      :key="item.id"
      class="st-toast"
      :data-st-tone="item.tone"
      :role="item.tone === 'danger' ? 'alert' : 'status'"
      @pointerenter="pause(item.id)"
      @pointerleave="arm(item)"
      @focusin="pause(item.id)"
      @focusout="arm(item)"
    >
      <span class="st-toast-message">{{ item.message }}</span>
      <StButton v-if="item.action" size="sm" @click="runAction(item)">
        {{ item.action.label }}
      </StButton>
      <StIconButton icon="close" label="Dismiss" size="sm" @click="dismiss(item.id)" />
    </div>
  </div>
</template>
