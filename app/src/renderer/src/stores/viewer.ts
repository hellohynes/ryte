import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { supportedKindOf } from '../../../shared/supported-types'
import type { CodeReadResult } from '../components/code-view-model'
import {
  isWorkspaceSourceFileRef,
  workspaceFileDisplayPath,
  workspaceFileKey,
  type WorkspaceViewMode
} from '../../../shared/workspace'
import { isOptimisticWorkspaceTabId, useWorkspaceStore } from './workspace'

interface RenderedTaskToggleInput {
  line: number
  checkboxColumn: number
  checked: boolean
}

interface MarkdownLine {
  text: string
  ending: string
}

function splitMarkdownLines(markdown: string): MarkdownLine[] {
  if (markdown.length === 0) return []

  const lines: MarkdownLine[] = []
  let start = 0
  for (let index = 0; index < markdown.length; index += 1) {
    const char = markdown[index]
    if (char !== '\n' && char !== '\r') continue

    let ending = char
    if (char === '\r' && markdown[index + 1] === '\n') {
      ending = '\r\n'
      index += 1
    }
    lines.push({ text: markdown.slice(start, index + 1 - ending.length), ending })
    start = index + 1
  }

  if (start < markdown.length) lines.push({ text: markdown.slice(start), ending: '' })
  return lines
}

function joinMarkdownLines(lines: MarkdownLine[]): string {
  return lines.map(({ text, ending }) => text + ending).join('')
}

function sourceLineAt(markdown: string, line: number): string | null {
  if (line < 1) return null

  let currentLine = 1
  let start = 0
  for (let index = 0; index < markdown.length; index += 1) {
    const char = markdown[index]
    if (char !== '\n' && char !== '\r') continue

    if (currentLine === line) return markdown.slice(start, index)
    if (char === '\r' && markdown[index + 1] === '\n') index += 1
    start = index + 1
    currentLine += 1
  }

  if (currentLine === line && start <= markdown.length) return markdown.slice(start)
  return null
}

function toggleMarkdownTaskMarker(markdown: string, input: RenderedTaskToggleInput): string | null {
  const lines = splitMarkdownLines(markdown)
  const targetLine = lines[input.line - 1]
  if (!targetLine) return null

  const marker = targetLine.text.slice(input.checkboxColumn, input.checkboxColumn + 3)
  if (marker !== '[ ]' && marker !== '[x]' && marker !== '[X]') return null

  lines[input.line - 1] = {
    ...targetLine,
    text:
      targetLine.text.slice(0, input.checkboxColumn) +
      (input.checked ? '[x]' : '[ ]') +
      targetLine.text.slice(input.checkboxColumn + 3)
  }
  return joinMarkdownLines(lines)
}

function taskToggleFailureMessage(reason: string): string {
  switch (reason) {
    case 'source-line-changed':
      return 'Task changed on disk before it could be updated. Refreshed the file.'
    case 'missing-file':
      return 'Task file no longer exists.'
    case 'invalid-source':
      return 'Task file is outside the notes folder.'
    default:
      return 'Task changed before it could be updated. Refreshed the file.'
  }
}

export const useViewerStore = defineStore('viewer', () => {
  const workspace = useWorkspaceStore()
  const tree = ref<string[]>([])
  const notesRoot = ref<string | null>(null)
  const content = ref<string>('')
  const loading = ref(false)
  const error = ref<string | null>(null)

  const activeTab = computed(() => workspace.activeTab)
  const activeTabId = computed(() => activeTab.value?.id ?? null)
  const sourcePath = computed(() =>
    activeTab.value && isWorkspaceSourceFileRef(activeTab.value) ? activeTab.value.sourcePath : null
  )
  // A picture tab shows the picture itself; it is never read as text or watched.
  const picturePath = computed(() =>
    sourcePath.value !== null && supportedKindOf(sourcePath.value) === 'picture'
      ? sourcePath.value
      : null
  )
  // A code tab reads its file through `code:read`; it is never read as a note or watched.
  const codePath = computed(() =>
    sourcePath.value !== null && supportedKindOf(sourcePath.value) === 'code'
      ? sourcePath.value
      : null
  )
  // A video tab plays the file itself through the `ryte-file` scheme; it is never read as text or watched.
  const videoPath = computed(() =>
    sourcePath.value !== null && supportedKindOf(sourcePath.value) === 'video'
      ? sourcePath.value
      : null
  )
  const codeFile = ref<CodeReadResult | null>(null)
  const displayPath = computed(() =>
    activeTab.value ? workspaceFileDisplayPath(activeTab.value) : null
  )
  const viewMode = computed<WorkspaceViewMode>(() => activeTab.value?.viewMode ?? 'preview')
  const sourceMode = computed(() => viewMode.value === 'source')

  let contentRequestId = 0
  let renderedTaskMutationId = 0
  let pendingRenderedTaskToggles = 0
  let unsubscribeSourceChange: (() => void) | null = null
  let unsubscribeTreeChange: (() => void) | null = null
  let unsubscribeCatalogChange: (() => void) | null = null
  let stopActiveTabWatch: (() => void) | null = null

  function sourcePathExists(paths: string[]): boolean {
    const tab = activeTab.value
    if (!tab || !isWorkspaceSourceFileRef(tab)) return true
    return paths.includes(tab.sourcePath)
  }

  function isCurrentRequest(requestId: number, tabId: string, requestedFileKey: string): boolean {
    return requestId === contentRequestId && isCurrentActiveTab(tabId, requestedFileKey)
  }

  function isCurrentActiveTab(tabId: string, requestedFileKey: string): boolean {
    const tab = activeTab.value
    return tab?.id === tabId && workspaceFileKey(tab) === requestedFileKey
  }

  async function refreshTree(): Promise<void> {
    const { notesRoot: root, paths } = await window.ryte.files.listTree()
    notesRoot.value = root
    tree.value = paths

    if (!sourcePathExists(paths)) {
      try {
        await workspace.pruneMissingFileRefs()
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e)
      }
    }
  }

  async function loadActiveTab(): Promise<void> {
    const tab = activeTab.value
    const requestId = ++contentRequestId

    codeFile.value = null

    if (!tab) {
      loading.value = false
      content.value = ''
      error.value = null
      try {
        await window.ryte.files.unwatch()
      } catch (e) {
        if (requestId === contentRequestId) {
          error.value = e instanceof Error ? e.message : String(e)
        }
      }
      return
    }

    if (picturePath.value !== null || videoPath.value !== null) {
      loading.value = false
      content.value = ''
      error.value = null
      try {
        await window.ryte.files.unwatch()
      } catch (e) {
        if (requestId === contentRequestId) {
          error.value = e instanceof Error ? e.message : String(e)
        }
      }
      return
    }

    if (codePath.value !== null) {
      await loadCodeTab(tab.id, codePath.value, requestId)
      return
    }

    loading.value = true
    content.value = ''
    error.value = null

    if (isOptimisticWorkspaceTabId(tab.id)) return

    try {
      const requestedFileKey = workspaceFileKey(tab)
      const nextContent = await window.ryte.files.readWorkspaceTab({ tabId: tab.id })
      if (!isCurrentRequest(requestId, tab.id, requestedFileKey)) return

      await window.ryte.files.watchWorkspaceTab({ tabId: tab.id })
      if (!isCurrentRequest(requestId, tab.id, requestedFileKey)) return

      content.value = nextContent
      error.value = null
    } catch (e) {
      if (!isCurrentRequest(requestId, tab.id, workspaceFileKey(tab))) return
      error.value = e instanceof Error ? e.message : String(e)
      content.value = ''
      try {
        await window.ryte.files.unwatch()
      } catch {
        // Preserve the read/watch error as the actionable viewer error.
      }
    } finally {
      if (requestId === contentRequestId) loading.value = false
    }
  }

  async function loadCodeTab(tabId: string, path: string, requestId: number): Promise<void> {
    loading.value = true
    content.value = ''
    error.value = null

    try {
      await window.ryte.files.unwatch()
    } catch {
      // Nothing is watched for a code tab; a failed unwatch changes nothing it shows.
    }
    if (requestId !== contentRequestId) return
    if (isOptimisticWorkspaceTabId(tabId)) return

    try {
      const result = await window.ryte.code.read({ path })
      if (requestId !== contentRequestId || codePath.value !== path) return
      codeFile.value = result
    } catch (e) {
      if (requestId !== contentRequestId || codePath.value !== path) return
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (requestId === contentRequestId) loading.value = false
    }
  }

  // Reads the open code file again after it changed on disk. An answer that arrives after the tab changed is dropped,
  // and the same text is not assigned again, so the view only changes when the file did.
  async function refreshCodeInBackground(): Promise<void> {
    const path = codePath.value
    const tab = activeTab.value
    if (path === null || !tab || isOptimisticWorkspaceTabId(tab.id)) return

    const requestId = contentRequestId
    try {
      const result = await window.ryte.code.read({ path })
      if (requestId !== contentRequestId || codePath.value !== path) return
      const current = codeFile.value
      if (current?.status === 'ok' && result.status === 'ok' && current.text === result.text) {
        return
      }
      codeFile.value = result
      error.value = null
    } catch (e) {
      if (requestId !== contentRequestId || codePath.value !== path) return
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function refreshActiveTabInBackground(): Promise<void> {
    const tab = activeTab.value
    if (
      !tab ||
      isOptimisticWorkspaceTabId(tab.id) ||
      picturePath.value !== null ||
      videoPath.value !== null ||
      codePath.value !== null
    ) {
      return
    }

    const requestedFileKey = workspaceFileKey(tab)
    const mutationId = renderedTaskMutationId

    try {
      const nextContent = await window.ryte.files.readWorkspaceTab({ tabId: tab.id })
      if (!isCurrentActiveTab(tab.id, requestedFileKey)) return
      if (pendingRenderedTaskToggles > 0 || mutationId !== renderedTaskMutationId) return

      if (content.value !== nextContent) content.value = nextContent
      error.value = null
    } catch (e) {
      if (!isCurrentActiveTab(tab.id, requestedFileKey)) return
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function hydrate(): Promise<void> {
    await refreshTree()

    unsubscribeSourceChange?.()
    unsubscribeTreeChange?.()
    unsubscribeCatalogChange?.()
    stopActiveTabWatch?.()

    unsubscribeSourceChange = window.ryte.files.onSourceChange((changedSourcePath) => {
      if (changedSourcePath === sourcePath.value) {
        void refreshActiveTabInBackground()
      }
    })

    const unsubscribeWorkspaceTabChange = window.ryte.files.onWorkspaceTabChange((changedTabId) => {
      if (changedTabId === activeTabId.value) {
        void refreshActiveTabInBackground()
      }
    })

    unsubscribeTreeChange = window.ryte.files.onTreeChanged(() => {
      void refreshTree()
    })

    // A code tab has no note watch; the catalog says when its file changed. No event means the whole catalog changed.
    unsubscribeCatalogChange = window.ryte.files.onCatalogChanged((event) => {
      const path = codePath.value
      if (path === null) return
      if (event) {
        const changedPath = event.type === 'upsert' ? event.file.sourcePath : event.sourcePath
        if (changedPath !== path) return
      }
      void refreshCodeInBackground()
    })

    stopActiveTabWatch = watch(
      () => [activeTabId.value, displayPath.value] as const,
      () => {
        void loadActiveTab()
      }
    )

    const originalStopActiveTabWatch = stopActiveTabWatch
    stopActiveTabWatch = () => {
      originalStopActiveTabWatch?.()
      unsubscribeWorkspaceTabChange()
    }

    await loadActiveTab()
  }

  async function setViewMode(nextViewMode: WorkspaceViewMode): Promise<void> {
    const tab = activeTab.value
    if (!tab || tab.viewMode === nextViewMode) return
    await workspace.updateTabViewMode({ tabId: tab.id, viewMode: nextViewMode })
  }

  async function toggleSourceMode(): Promise<void> {
    await setViewMode(sourceMode.value ? 'preview' : 'source')
  }

  async function toggleRenderedTask(input: RenderedTaskToggleInput): Promise<void> {
    const currentSourcePath = sourcePath.value
    if (!currentSourcePath) {
      error.value = 'Tasks can only be updated for files in the notes folder.'
      return
    }

    const previousContent = content.value
    const expectedLine = sourceLineAt(previousContent, input.line)
    if (expectedLine === null) {
      error.value = 'Task line is no longer available.'
      return
    }

    const optimisticContent = toggleMarkdownTaskMarker(previousContent, input)
    if (optimisticContent === null) {
      error.value = 'Task checkbox is no longer available.'
      return
    }

    const mutationId = ++renderedTaskMutationId
    pendingRenderedTaskToggles += 1
    content.value = optimisticContent
    error.value = null

    try {
      const result = await window.ryte.tasks.toggle({
        sourcePath: currentSourcePath,
        line: input.line,
        checkboxColumn: input.checkboxColumn,
        checked: input.checked,
        expectedLine
      })

      if (mutationId !== renderedTaskMutationId || sourcePath.value !== currentSourcePath) return

      if (result.ok) {
        if (content.value !== result.markdown) content.value = result.markdown
        error.value = null
        return
      }

      error.value = taskToggleFailureMessage(result.reason)
      void refreshActiveTabInBackground()
    } catch (e) {
      if (mutationId !== renderedTaskMutationId || sourcePath.value !== currentSourcePath) return
      content.value = previousContent
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      pendingRenderedTaskToggles -= 1
    }
  }

  return {
    tree,
    notesRoot,
    content,
    loading,
    error,
    activeTab,
    activeTabId,
    sourcePath,
    picturePath,
    videoPath,
    codePath,
    codeFile,
    displayPath,
    selectedPath: displayPath,
    viewMode,
    sourceMode,
    hydrate,
    refreshTree,
    loadActiveTab,
    setViewMode,
    toggleSourceMode,
    toggleRenderedTask
  }
})
