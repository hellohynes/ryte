<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import { usePreferenceSaves } from '../../preferences/use-preference-saves'
import StSelect from '../../stencil/components/StSelect.vue'

const props = defineProps<{
  modelValue: string
  options: ReadonlyArray<{ value: string; label: string }>
  label: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const select = ref<InstanceType<typeof StSelect> | null>(null)

// The browser changes a select before the save finishes. If the save fails the saved value has not
// changed, so Vue sees nothing to redraw; put the element back by hand.
const { revision } = usePreferenceSaves()
watch(revision, async () => {
  await nextTick()
  if (select.value?.el) select.value.el.value = props.modelValue
})
</script>

<template>
  <StSelect
    ref="select"
    :model-value="modelValue"
    :options="options"
    :label="label"
    :disabled="disabled"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
