<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { embeddingBarText } from '../preferences/embedding-model'
import { useEmbeddingStatusStore } from '../stores/embedding-status'
import { useIndexStatusStore } from '../stores/index-status'
import { useSettingsStore } from '../stores/settings'
import { useWorkspaceStore } from '../stores/workspace'
import { statusBarView } from './status-bar-model'

const indexStatus = useIndexStatusStore()
const embeddingStatus = useEmbeddingStatusStore()
const settings = useSettingsStore()
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

// Smart search shows beside the index messages, never in place of one: see `statusBarView`.
const smartSearchText = computed(() =>
  embeddingBarText(embeddingStatus.status, settings.state?.semanticIndexEnabled === true)
)

const view = computed(() =>
  statusBarView({
    workspaceError: workspace.error,
    index: indexStatus.status,
    localVisible: visible.value,
    smartText: smartSearchText.value,
    smartRunning: embeddingStatus.status?.state === 'running'
  })
)
const message = computed(() => view.value.message)
const tone = computed(() => view.value.tone)
const isVisible = computed(() => view.value.visible)
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
  color: var(--st-color-text-secondary);
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
  color: var(--st-color-info-strong);
}

.status-bar.tone-error {
  color: var(--st-color-danger);
  background: var(--st-color-surface-danger);
}

.status-bar.tone-ready {
  color: var(--st-color-success-strong);
}
</style>
