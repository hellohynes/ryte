import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { FileCatalogChangeEvent, FileCatalogEntry } from '../../../shared/files'

const CATALOG_REFRESH_DEBOUNCE_MS = 100

export const useFileCatalogStore = defineStore('file-catalog', () => {
  const files = ref<FileCatalogEntry[]>([])
  const notesRoot = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const revision = ref(0)

  let unsubscribeCatalogChanged: (() => void) | null = null
  let refreshRequestId = 0
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let bindCount = 0
  let catalogChangeRevision = 0
  let activeRefreshRequestId: number | null = null
  const catalogChanges: Array<{ revision: number; event: FileCatalogChangeEvent }> = []

  async function refreshCatalog(): Promise<void> {
    const requestId = ++refreshRequestId
    const changeRevision = catalogChangeRevision
    activeRefreshRequestId = requestId
    loading.value = true
    error.value = null

    try {
      const response = await window.ryte.files.listCatalog()
      if (requestId !== refreshRequestId) return

      notesRoot.value = response.notesRoot
      files.value = applyCatalogChanges(response.files, changesAfter(changeRevision))
      catalogChanges.length = 0
      revision.value += 1
    } catch (e) {
      if (requestId !== refreshRequestId) return

      error.value = e instanceof Error ? e.message : String(e)
      files.value = []
      revision.value += 1
    } finally {
      if (requestId === refreshRequestId) loading.value = false
      if (requestId === activeRefreshRequestId) activeRefreshRequestId = null
    }
  }

  function scheduleRefreshCatalog(): void {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      void refreshCatalog()
    }, CATALOG_REFRESH_DEBOUNCE_MS)
  }

  function applyCatalogChange(event: FileCatalogChangeEvent): void {
    catalogChangeRevision += 1
    if (activeRefreshRequestId !== null) {
      catalogChanges.push({ revision: catalogChangeRevision, event })
    }
    files.value = applyCatalogChanges(files.value, [event])
    error.value = null
    revision.value += 1
  }

  function changesAfter(changeRevision: number): FileCatalogChangeEvent[] {
    return catalogChanges
      .filter((change) => change.revision > changeRevision)
      .map((change) => change.event)
  }

  async function hydrate(): Promise<void> {
    const wasUnbound = bindCount === 0
    const shouldRefresh = wasUnbound || error.value !== null
    bindCount += 1
    if (!unsubscribeCatalogChanged) {
      unsubscribeCatalogChanged = window.ryte.files.onCatalogChanged((event) => {
        if (event) {
          applyCatalogChange(event)
        } else {
          scheduleRefreshCatalog()
        }
      })
    }

    if (shouldRefresh) await refreshCatalog()
  }

  function unbind(): void {
    bindCount = Math.max(0, bindCount - 1)
    if (bindCount > 0) return

    unsubscribeCatalogChanged?.()
    unsubscribeCatalogChanged = null
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
  }

  return {
    files,
    notesRoot,
    loading,
    error,
    revision,
    hydrate,
    refreshCatalog,
    unbind
  }
})

function applyCatalogChanges(
  catalog: readonly FileCatalogEntry[],
  changes: readonly FileCatalogChangeEvent[]
): FileCatalogEntry[] {
  const bySourcePath = new Map(catalog.map((file) => [file.sourcePath, file]))
  for (const change of changes) {
    if (change.type === 'upsert') {
      bySourcePath.set(change.file.sourcePath, change.file)
    } else {
      bySourcePath.delete(change.sourcePath)
    }
  }
  return [...bySourcePath.values()].sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath)
  )
}
