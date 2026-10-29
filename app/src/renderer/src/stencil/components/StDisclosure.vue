<script setup lang="ts">
/** A native details element whose body glides open, with a chevron and a `summary` slot. v-model:open. */
import StIcon from '../icons/StIcon.vue'

defineProps<{ open?: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()

defineSlots<{
  /** The always-visible line the reader clicks. */
  summary(): unknown
  default(): unknown
}>()
</script>

<template>
  <details
    class="st-disclosure"
    :open="open"
    @toggle="emit('update:open', ($event.target as HTMLDetailsElement).open)"
  >
    <summary class="st-disclosure-summary">
      <StIcon name="chevron-right" :size="12" class="st-disclosure-chevron" />
      <slot name="summary" />
    </summary>
    <slot />
  </details>
</template>
