<script setup lang="ts">
/** A checkbox with a label slot. v-model is a boolean; Space toggles it. */
import { ref } from 'vue'

import StIcon from '../icons/StIcon.vue'

defineProps<{ modelValue: boolean; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [checked: boolean] }>()
const el = ref<HTMLInputElement | null>(null)
defineExpose({ el })
</script>

<template>
  <label class="st-checkbox" :data-st-disabled="disabled ? '' : undefined">
    <input
      ref="el"
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="st-checkbox-box" aria-hidden="true"><StIcon name="check" :size="12" /></span>
    <span class="st-checkbox-label"><slot /></span>
  </label>
</template>
