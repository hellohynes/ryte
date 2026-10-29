<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import { usePreferenceSaves } from '../../preferences/use-preference-saves'
import StCheckbox from '../../stencil/components/StCheckbox.vue'

const props = defineProps<{ checked: boolean; disabled?: boolean }>()
const emit = defineEmits<{ change: [checked: boolean] }>()

const box = ref<InstanceType<typeof StCheckbox> | null>(null)

// A box ticks before its save finishes. If the save fails the saved value has not changed, so Vue
// sees nothing to redraw; put the box back by hand.
const { revision } = usePreferenceSaves()
watch(revision, async () => {
  await nextTick()
  if (box.value?.el) box.value.el.checked = props.checked
})
</script>

<template>
  <StCheckbox
    ref="box"
    :model-value="checked"
    :disabled="disabled"
    @update:model-value="emit('change', $event)"
  >
    <slot />
  </StCheckbox>
</template>
