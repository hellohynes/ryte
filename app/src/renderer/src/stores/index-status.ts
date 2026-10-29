import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { IndexerStatus } from '../../../preload'

const DEFAULT_STATUS: IndexerStatus = {
  phase: 'idle',
  filesTotal: 0,
  filesDone: 0,
  chunksTotal: 0,
  chunksDone: 0,
  lastIndexedAt: null
}

export const useIndexStatusStore = defineStore('indexStatus', () => {
  const status = ref<IndexerStatus>(DEFAULT_STATUS)
  let unsubscribe: (() => void) | null = null

  async function bind(): Promise<void> {
    if (unsubscribe) return
    status.value = await window.ryte.indexer.getStatus()
    unsubscribe = window.ryte.indexer.onStatus((s) => {
      status.value = s
    })
  }

  async function triggerReindex(): Promise<void> {
    await window.ryte.indexer.triggerReindex()
  }

  async function clearAndRebuild(): Promise<void> {
    await window.ryte.indexer.clearAndRebuild()
  }

  return { status, bind, triggerReindex, clearAndRebuild }
})
