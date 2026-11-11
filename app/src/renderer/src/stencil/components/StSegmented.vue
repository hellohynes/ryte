<script setup lang="ts">
/** A radio group drawn as joined buttons. Arrows select as they move; Home and End jump; one tab stop. */
import { ref } from 'vue'

import { rovingTarget } from '../behaviors/roving'
import StIcon from '../icons/StIcon.vue'
import type { IconName } from '../icons/icons.generated'

const props = withDefaults(
  defineProps<{
    modelValue: string
    /** Each option may carry an `icon`, drawn before its label and hidden from assistive tech. */
    options: ReadonlyArray<{ value: string; label: string; icon?: IconName }>
    /** The accessible name of the group. */
    label: string
    /** `md` is a row of separate buttons. `sm` is one compact joined pill, sized for a toolbar. */
    size?: 'md' | 'sm'
  }>(),
  { size: 'md' }
)
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
  <div class="st-segmented" role="radiogroup" :aria-label="label" :data-st-size="size">
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
      <StIcon v-if="option.icon" :name="option.icon" :size="size === 'sm' ? 12 : 16" />
      {{ option.label }}
    </button>
  </div>
</template>
