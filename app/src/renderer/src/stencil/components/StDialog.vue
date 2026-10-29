<script setup lang="ts">
/** A modal window on the native dialog element: it fills the window as the scrim and holds your panel in its slot. Escape and a click on the scrim emit `dismiss`; focus is trapped inside and returns to the opener. */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useDismissLayer, type DismissReason } from '../behaviors/useDismissLayer'
import { useFocusReturn } from '../behaviors/useFocusReturn'

const props = withDefaults(
  defineProps<{
    /** Mount it open, or toggle it. Default true, so `v-if` on the parent opens and closes it. */
    open?: boolean
    /** The accessible name, unless `labelledby` points at a visible heading. */
    label?: string
    labelledby?: string
    /** Where the panel sits: centered, or near the top like a command palette. */
    placement?: 'center' | 'top'
    /** `dim` darkens the window behind it; `clear` leaves it visible, for settings that preview. */
    scrim?: 'dim' | 'clear'
    /** Escape and a click on the scrim ask to dismiss. */
    dismissable?: boolean
    /** Where focus starts: the first control (default), or the dialog itself so its title is read first. */
    focus?: 'content' | 'dialog'
  }>(),
  { open: true, placement: 'center', scrim: 'dim', dismissable: true, focus: 'content' }
)
const emit = defineEmits<{ dismiss: [reason: DismissReason] }>()

const el = ref<HTMLDialogElement | null>(null)
let pressedScrim = false

function sync(): void {
  const dialog = el.value
  if (!dialog) return
  if (props.open && !dialog.open) {
    dialog.showModal()
    if (props.focus === 'dialog') dialog.focus()
  } else if (!props.open && dialog.open) dialog.close()
}

// Remembers the opener before the dialog takes focus, and gives focus back when it closes.
useFocusReturn(() => props.open)
useDismissLayer({
  open: () => props.open,
  escape: () => props.dismissable,
  outside: false,
  onDismiss: (reason) => emit('dismiss', reason)
})

// A press that starts inside the panel and ends on the scrim (a text selection) is not a click on it.
function onPointerDown(event: PointerEvent): void {
  pressedScrim = event.target === el.value
}

function onClick(event: MouseEvent): void {
  if (event.target === el.value && pressedScrim && props.dismissable) emit('dismiss', 'outside')
  pressedScrim = false
}

onMounted(sync)
// Closed by unmounting (v-if), the dialog is still modal while focus is returned, which would make
// the opener inert. Closing it first lets focus go back.
onBeforeUnmount(() => {
  if (el.value?.open) el.value.close()
})
watch(() => props.open, sync)
defineExpose({ el })
</script>

<template>
  <dialog
    ref="el"
    class="st-dialog"
    :data-st-placement="placement"
    :data-st-scrim="scrim"
    :aria-label="label"
    :aria-labelledby="labelledby"
    tabindex="-1"
    @cancel.prevent
    @pointerdown="onPointerDown"
    @click="onClick"
  >
    <slot />
  </dialog>
</template>
