<script setup lang="ts">
/** A text input. Variants boxed (forms), inline (renaming in place, takes the font of what it replaces), and bare (no chrome, such as a search box). Exposes focus() and select(start, end). */
import { computed, ref } from 'vue'

import { inputAttributes, type InputProps } from './input-props'

const props = defineProps<
  InputProps & {
    modelValue?: string
    /** The accessible name. Required when there is no visible label. */
    label?: string
  }
>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const el = ref<HTMLInputElement | null>(null)
const attrs = computed(() => inputAttributes(props))

defineExpose({
  focus: (): void => el.value?.focus(),
  /** Selects a range, for inline edits that keep a file extension out of the selection. */
  select: (start: number, end: number): void => el.value?.setSelectionRange(start, end),
  el
})
</script>

<template>
  <input
    ref="el"
    class="st-input"
    v-bind="attrs"
    :value="modelValue"
    :aria-label="label"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
