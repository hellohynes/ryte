<script setup lang="ts">
import { computed } from 'vue'

import StMenu from '../stencil/components/StMenu.vue'
import StMenuItem from '../stencil/components/StMenuItem.vue'
import StMenuSeparator from '../stencil/components/StMenuSeparator.vue'
import type { FileContextMenuAction } from './file-context-menu-model'

const props = defineProps<{
  x: number
  y: number
  fileName: string
  canClose?: boolean
}>()

const emit = defineEmits<{
  action: [action: FileContextMenuAction]
  dismiss: []
}>()

// The menu opens at the pointer: a rect with no size.
const anchor = computed(() => ({ x: props.x, y: props.y, width: 0, height: 0 }))
</script>

<template>
  <StMenu open :anchor="anchor" :label="`File actions for ${fileName}`" @dismiss="emit('dismiss')">
    <StMenuItem @click="emit('action', 'copy-file')">Copy file</StMenuItem>
    <StMenuItem @click="emit('action', 'rename')">Rename</StMenuItem>
    <StMenuSeparator />
    <StMenuItem @click="emit('action', 'show-in-finder')">Show in Finder</StMenuItem>
    <StMenuItem @click="emit('action', 'copy-file-path')">Copy file path</StMenuItem>
    <template v-if="canClose">
      <StMenuSeparator />
      <StMenuItem @click="emit('action', 'close')">Close</StMenuItem>
    </template>
    <StMenuSeparator />
    <StMenuItem tone="danger" @click="emit('action', 'move-to-trash')">Move to Trash</StMenuItem>
  </StMenu>
</template>
