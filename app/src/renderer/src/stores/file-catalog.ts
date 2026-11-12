import { defineStore } from 'pinia'
import { ref, shallowRef, watch } from 'vue'

import type { FileCatalogChangeEvent, FileCatalogEntry } from '../../../shared/files'
import { useSettingsStore } from './settings'

const CATALOG_REFRESH_DEBOUNCE_MS = 100

export const useFileCatalogStore = defineStore('file-catalog', () => {
  const settings = useSettingsStore()
  // One entry per file, often tens of thousands: replaced whole, never changed in place, so not deep.
  const files = shallowRef<FileCatalogEntry[]>([])
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

  // The catalog belongs to one notes folder. When the folder changes, nothing of the old one may stay on screen, and an answer
  // still on its way for the old one must not land. A screen that is using the catalog gets the new folder's at once; with none
  // bound, the next one to bind loads it (the first bind always loads).
  function followNotesFolder(): void {
    refreshRequestId += 1
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
    catalogChanges.length = 0
    files.value = []
    notesRoot.value = null
    error.value = null
    loading.value = false
    revision.value += 1
    if (bindCount > 0) void refreshCatalog()
  }

  watch(
    () => settings.state?.notesRoot,
    (next, previous) => {
      // The watch fires only when the folder itself differs, never for another setting. The first folder the settings report is
      // not a change.
      if (previous === undefined || next === undefined) return
      followNotesFolder()
    },
    { flush: 'sync' }
  )

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
