<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useIndexStatusStore } from '../stores/index-status'
import { useWorkspaceStore } from '../stores/workspace'

const indexStatus = useIndexStatusStore()
const workspace = useWorkspaceStore()
const visible = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | null = null

function clearHideTimer(): void {
  if (hideTimer !== null) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

watch(
  () => indexStatus.status.phase,
  (phase) => {
    clearHideTimer()
    if (phase === 'walking' || phase === 'indexing' || phase === 'error') {
      visible.value = true
    } else if (phase === 'done') {
      const s = indexStatus.status
      if (s.chunksTotal === 0 && s.filesTotal === 0) {
        visible.value = false
        return
      }
      visible.value = true
      hideTimer = setTimeout(() => {
        visible.value = false
        hideTimer = null
      }, 4000)
    } else {
      // idle
      visible.value = false
    }
  },
  { immediate: true }
)

const message = computed(() => {
  if (workspace.error) return `Workspace error: ${workspace.error}`

  const s = indexStatus.status
  switch (s.phase) {
    case 'walking':
      return 'Walking notes…'
    case 'indexing': {
      const total = s.chunksTotal || '?'
      return `Indexing ${s.chunksDone}/${total} chunks · ${s.filesDone}/${s.filesTotal} files`
    }
    case 'done':
      if (s.chunksTotal === 0 && s.filesTotal === 0) return ''
      return `Index ready: ${s.chunksTotal} chunks across ${s.filesTotal} files`
    case 'error':
      return `Indexing error: ${s.error ?? 'unknown'}`
    default:
      return ''
  }
})

const tone = computed(() => {
  if (workspace.error) return 'error'

  switch (indexStatus.status.phase) {
    case 'indexing':
    case 'walking':
      return 'busy'
    case 'error':
      return 'error'
    case 'done':
      return 'ready'
    default:
      return 'idle'
  }
})

const isVisible = computed(() => Boolean(workspace.error) || visible.value)
</script>

<template>
  <footer class="status-bar" :class="[`tone-${tone}`, { hidden: !isVisible }]">
    <span class="status-text">{{ message }}</span>
  </footer>
</template>

<style scoped>
.status-bar {
  height: var(--st-block-350);
  display: flex;
  align-items: center;
  padding: 0 var(--st-space-175);
  border-top: var(--st-border-100) solid var(--st-color-border-subtle);
  font-size: var(--st-type-body-sm-size);
  font-variant-numeric: tabular-nums;
  background: var(--st-color-surface-sunken);
  color: var(--st-color-text-tertiary);
  overflow: hidden;
  transition:
    height 350ms ease,
    opacity 350ms ease;
}

.status-bar.hidden {
  height: 0;
  opacity: 0;
  border-top-color: transparent;
}

.status-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-bar.tone-busy {
  color: var(--st-color-info);
}

.status-bar.tone-error {
  color: var(--st-color-danger);
  background: var(--st-color-surface-danger);
}

.status-bar.tone-ready {
  color: var(--st-color-success);
}
</style>
