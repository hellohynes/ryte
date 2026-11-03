import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { EmbeddingStatus } from '../../../contract/indexer'

/**
 * What smart search is doing, as main reports it. Main sends every change to every window and answers when asked, so this binds
 * like the rebuild notice: listen first, then ask once for the current state.
 */
export const useEmbeddingStatusStore = defineStore('embeddingStatus', () => {
  const status = ref<EmbeddingStatus | null>(null)
  let unsubscribe: (() => void) | null = null

  async function bind(): Promise<void> {
    if (unsubscribe) return
    unsubscribe = window.ryte.indexer.onEmbeddingStatus((next) => {
      status.value = next
    })
    try {
      // Only fill it from the answer when nothing newer arrived while asking.
      const current = await window.ryte.indexer.getEmbeddingStatus()
      if (status.value === null) status.value = current
    } catch {
      // Without it the app shows nothing about smart search, and carries on.
    }
  }

  return { status, bind }
})
