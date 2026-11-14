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
  /** False for a picture: it cannot be renamed or copied as text. */
  isNote: boolean
  canClose?: boolean
  /** A local address: it is not a file, so only the browser and close items apply. */
  isAddress?: boolean
  canOpenInBrowser?: boolean
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
    <template v-if="isNote">
      <StMenuItem @click="emit('action', 'copy-file')">Copy file</StMenuItem>
      <StMenuItem @click="emit('action', 'rename')">Rename</StMenuItem>
      <StMenuSeparator />
    </template>
    <StMenuItem v-if="canOpenInBrowser" @click="emit('action', 'open-in-browser')">
      Open in Browser
    </StMenuItem>
    <template v-if="!isAddress">
      <StMenuItem @click="emit('action', 'show-in-finder')">Show in Finder</StMenuItem>
      <StMenuItem @click="emit('action', 'copy-file-path')">Copy file path</StMenuItem>
    </template>
    <template v-if="canClose">
      <StMenuSeparator />
      <StMenuItem @click="emit('action', 'close')">Close</StMenuItem>
    </template>
    <template v-if="!isAddress">
      <StMenuSeparator />
      <StMenuItem tone="danger" @click="emit('action', 'move-to-trash')">Move to Trash</StMenuItem>
    </template>
  </StMenu>
</template>
