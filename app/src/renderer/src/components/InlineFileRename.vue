<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

import StInput from '../stencil/components/StInput.vue'

const props = defineProps<{
  name: string
  label: string
  variant: 'sidebar' | 'tab'
}>()

const emit = defineEmits<{
  submit: [name: string]
  cancel: []
}>()

const input = ref<InstanceType<typeof StInput> | null>(null)
const value = ref(props.name)

onMounted(() => {
  void nextTick(() => {
    if (!input.value) return
    input.value.focus()
    const extensionStart = props.name.toLowerCase().endsWith('.md')
      ? props.name.length - 3
      : props.name.length
    input.value.select(0, extensionStart)
  })
})
</script>

<template>
  <StInput
    ref="input"
    v-model="value"
    variant="inline"
    :class="`inline-rename-${variant}`"
    :label="label"
    spellcheck="false"
    @click.stop
    @pointerdown.stop
    @contextmenu.stop
    @keydown.enter.prevent.stop="emit('submit', value.trim())"
    @keydown.escape.prevent.stop="emit('cancel')"
    @blur="emit('cancel')"
  />
</template>

<style scoped>
.inline-rename-sidebar {
  position: relative;
  z-index: 3;
  flex: 1 1 auto;
  min-width: 0;
  margin-block: var(--st-space-50-negative);
}

.inline-rename-tab {
  flex: 0 1 15.36rem;
  min-width: var(--st-layout-125);
}

/* The inline variant inherits its font; a tab renames at the tab's smaller size. Class names are
   prefixed because the parent's scoped `.sidebar` and `.tab` rules also reach this root. */
.st-input.inline-rename-tab {
  font-size: var(--st-type-body-sm-size);
}
</style>
