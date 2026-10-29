<script setup lang="ts">
/** A radio group drawn as joined buttons. Arrows select as they move; Home and End jump; one tab stop. */
import { ref } from 'vue'

import { rovingTarget } from '../behaviors/roving'

const props = defineProps<{
  modelValue: string
  options: ReadonlyArray<{ value: string; label: string }>
  /** The accessible name of the group. */
  label: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const buttons = ref<HTMLButtonElement[]>([])

/** Arrow keys move through the options and choose as they go, like a radio group. */
function onKeydown(event: KeyboardEvent, index: number): void {
  const target = rovingTarget(event.key, index, props.options.length, { orientation: 'both' })
  if (target === null) return
  event.preventDefault()
  buttons.value[target]?.focus()
  emit('update:modelValue', props.options[target]!.value)
}
</script>

<template>
  <div class="st-segmented" role="radiogroup" :aria-label="label">
    <button
      v-for="(option, index) in options"
      :key="option.value"
      :ref="(el) => (buttons[index] = el as HTMLButtonElement)"
      type="button"
      role="radio"
      class="st-segmented-option"
      :aria-checked="modelValue === option.value"
      :tabindex="modelValue === option.value ? 0 : -1"
      @click="emit('update:modelValue', option.value)"
      @keydown="onKeydown($event, index)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
