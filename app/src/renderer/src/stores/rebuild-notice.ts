import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface RebuildNotice {
  message: string
  detail: string
}

/**
 * The notice shown after an update removed the old search index and is rebuilding it. Main keeps it until it is dismissed, so it
 * is asked for once when the app binds, and main also says when it appears or goes (it can appear after this window opened).
 */
export const useRebuildNoticeStore = defineStore('rebuildNotice', () => {
  const notice = ref<RebuildNotice | null>(null)
  let unsubscribe: (() => void) | null = null

  async function bind(): Promise<void> {
    if (unsubscribe) return
    unsubscribe = window.ryte.indexer.onRebuildNotice((next) => {
      notice.value = next
    })
    try {
      // Only fill it from the answer when nothing newer arrived while asking.
      const current = await window.ryte.indexer.getRebuildNotice()
      if (notice.value === null) notice.value = current
    } catch {
      // A notice that cannot be fetched is not shown; the app works without it.
    }
  }

  async function dismiss(): Promise<void> {
    notice.value = null
    try {
      await window.ryte.indexer.dismissRebuildNotice()
    } catch {
      // It is already hidden here; main drops it on its own at the next start.
    }
  }

  return { notice, bind, dismiss }
})
