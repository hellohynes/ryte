<script setup lang="ts">
/** A native select drawn like the boxed input, with a chevron. v-model is the value string. */
import { ref } from 'vue'

import StIcon from '../icons/StIcon.vue'
import type { InputSize } from './input-props'

defineProps<{
  modelValue: string
  options: ReadonlyArray<{ value: string; label: string }>
  /** The accessible name. Required when there is no visible label. */
  label?: string
  size?: InputSize
  invalid?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const el = ref<HTMLSelectElement | null>(null)
defineExpose({ el })
</script>

<template>
  <span class="st-select">
    <select
      ref="el"
      class="st-input"
      data-st-variant="boxed"
      :data-st-size="size ?? 'md'"
      :data-st-invalid="invalid ? '' : undefined"
      :aria-invalid="invalid ? 'true' : undefined"
      :aria-label="label"
      :value="modelValue"
      :disabled="disabled"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
    <StIcon name="chevron-right" :size="12" class="st-select-chevron" />
  </span>
</template>
