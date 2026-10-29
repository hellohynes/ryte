import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { MarkdownTaskFact } from '../../../shared/tasks'

const TASK_REFRESH_DEBOUNCE_MS = 150
const HOME_TASK_LIMIT = 25

export const useTasksStore = defineStore('tasks', () => {
  const tasks = ref<MarkdownTaskFact[]>([])
  const notesRoot = ref<string | null>(null)
  const refreshedAt = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const revision = ref(0)

  const openTasks = computed(() => tasks.value.filter((task) => !task.checked))

  let unsubscribeTasksChanged: (() => void) | null = null
  let refreshRequestId = 0
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let bindCount = 0

  async function refreshTasks(): Promise<void> {
    const requestId = ++refreshRequestId
    loading.value = true
    error.value = null

    try {
      const response = await window.ryte.tasks.list({ checked: false, limit: HOME_TASK_LIMIT })
      if (requestId !== refreshRequestId) return

      notesRoot.value = response.notesRoot
      tasks.value = response.tasks
      refreshedAt.value = response.refreshedAt
      revision.value += 1
    } catch (e) {
      if (requestId !== refreshRequestId) return

      error.value = e instanceof Error ? e.message : String(e)
      tasks.value = []
      revision.value += 1
    } finally {
      if (requestId === refreshRequestId) loading.value = false
    }
  }

  function scheduleRefreshTasks(): void {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      void refreshTasks()
    }, TASK_REFRESH_DEBOUNCE_MS)
  }

  async function hydrate(): Promise<void> {
    const wasUnbound = bindCount === 0
    const shouldRefresh = wasUnbound || error.value !== null
    bindCount += 1
    if (!unsubscribeTasksChanged) {
      unsubscribeTasksChanged = window.ryte.tasks.onChanged(() => {
        scheduleRefreshTasks()
      })
    }

    if (shouldRefresh) await refreshTasks()
  }

  function unbind(): void {
    bindCount = Math.max(0, bindCount - 1)
    if (bindCount > 0) return

    unsubscribeTasksChanged?.()
    unsubscribeTasksChanged = null
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
  }

  return {
    tasks,
    openTasks,
    notesRoot,
    refreshedAt,
    loading,
    error,
    revision,
    hydrate,
    refreshTasks,
    unbind
  }
})
