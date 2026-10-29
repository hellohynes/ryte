<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import StMenu from '../stencil/components/StMenu.vue'
import StMenuItem from '../stencil/components/StMenuItem.vue'
import StMenuLabel from '../stencil/components/StMenuLabel.vue'
import FileContextMenu from './FileContextMenu.vue'
import type { FileContextMenuAction } from './file-context-menu-model'
import { resolveFileIconName } from './file-icon-resolver'
import StText from '../stencil/components/StText.vue'
import StIcon from '../stencil/icons/StIcon.vue'
import type { IconName } from '../stencil/icons/icons.generated'
import InlineFileRename from './InlineFileRename.vue'
import {
  buildSidebarTree,
  modifiedAtMsBySourcePath,
  type SidebarTreeNode as TreeNode
} from './sidebar-tree-model'
import type { WorkspaceFolderSortMode } from '../../../shared/workspace'
import { useFileCatalogStore } from '../stores/file-catalog'
import { useViewerStore } from '../stores/viewer'
import { useWorkspaceStore } from '../stores/workspace'

interface TreeConnector {
  key: string
  depth: number
  startIndex: number
  rowCount: number
}

interface SidebarFileContextMenu {
  sourcePath: string
  name: string
  x: number
  y: number
}

interface SidebarInlineRename {
  sourcePath: string
}

const TREE_ROW_FONT_SIZE_PX = 12
const TREE_CHEVRON_WIDTH_PX = 14
const TREE_ROW_GAP_EM = 0.889
const TREE_DEPTH_INDENT_EM = TREE_CHEVRON_WIDTH_PX / TREE_ROW_FONT_SIZE_PX + TREE_ROW_GAP_EM
const TREE_DEPTH_INDENT_PX = TREE_DEPTH_INDENT_EM * TREE_ROW_FONT_SIZE_PX
const CHEVRON_CENTER_PX = TREE_CHEVRON_WIDTH_PX / 2
const TREE_ROW_PADDING_LEFT_EM = 0.25
const TREE_ROW_PADDING_LEFT_PX = TREE_ROW_FONT_SIZE_PX * TREE_ROW_PADDING_LEFT_EM
const TREE_ROW_HEIGHT_PX = 26
const TREE_PADDING_X_PX = 12
const TREE_PADDING_Y_PX = 8
const TREE_CONNECTOR_OVERHANG_PX = 2
const SORT_OPTIONS: Array<{ mode: WorkspaceFolderSortMode; label: string }> = [
  { mode: 'az', label: 'A-Z' },
  { mode: 'za', label: 'Z-A' },
  { mode: 'recency', label: 'Recency' }
]

const viewer = useViewerStore()
const workspace = useWorkspaceStore()
const catalog = useFileCatalogStore()
const expanded = ref<Set<string>>(new Set())
const focusedIndex = ref(0)
const treeHasFocus = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const openSortMenuFor = ref<string | null>(null)
const sortMenuAnchor = ref<HTMLElement | null>(null)
const fileContextMenu = ref<SidebarFileContextMenu | null>(null)
const inlineRename = ref<SidebarInlineRename | null>(null)
let activeSourcePathInitialized = false
let libraryScrollRestored = false
let restoringLibraryScroll = false
let scrollPersistTimer: number | null = null

const tree = computed<TreeNode[]>(() => {
  if (!viewer.notesRoot || viewer.tree.length === 0) return []
  return buildSidebarTree(
    viewer.tree,
    workspace.library.folderSortModes,
    modifiedAtMsBySourcePath(catalog.files)
  )
})

function flatten(nodes: TreeNode[], out: TreeNode[] = []): TreeNode[] {
  for (const node of nodes) {
    out.push(node)
    if (node.isFolder && expanded.value.has(node.relPath)) {
      flatten(node.children, out)
    }
  }
  return out
}

const visibleRows = computed<TreeNode[]>(() => flatten(tree.value))

const treeConnectors = computed<TreeConnector[]>(() => {
  const rows = visibleRows.value
  const connectors: TreeConnector[] = []

  for (const [index, row] of rows.entries()) {
    if (!row.isFolder || !isExpanded(row)) continue

    let lastDescendantIndex = index
    while (
      lastDescendantIndex + 1 < rows.length &&
      rows[lastDescendantIndex + 1].depth > row.depth
    ) {
      lastDescendantIndex++
    }

    const rowCount = lastDescendantIndex - index
    if (rowCount > 0) {
      connectors.push({
        key: row.relPath,
        depth: row.depth,
        startIndex: index + 1,
        rowCount
      })
    }
  }

  return connectors
})

watch(
  () => workspace.library.expandedFolders,
  (savedExpandedFolders) => {
    if (savedExpandedFolders === null) return
    expanded.value = new Set(savedExpandedFolders)
  },
  { immediate: true }
)

watch(
  tree,
  (next) => {
    if (next.length === 0) return
    if (workspace.library.expandedFolders !== null) {
      if (viewer.sourcePath) expandAncestorsForSourcePath(viewer.sourcePath)
      return
    }
    // Default-expand all root-level folders so the user sees structure on first load.
    const nextExpanded = new Set(expanded.value)
    for (const node of next) {
      if (node.isFolder) nextExpanded.add(node.relPath)
    }
    if (viewer.sourcePath) {
      const parts = viewer.sourcePath.split('/')
      parts.pop()
      for (let index = 0; index < parts.length; index += 1) {
        nextExpanded.add(parts.slice(0, index + 1).join('/'))
      }
    }
    expanded.value = nextExpanded
    persistExpandedFolders(nextExpanded)
  },
  { immediate: true }
)

watch(
  visibleRows,
  () => {
    void restoreLibraryScroll()
    syncFocusedIndexToSelectedRow()
  },
  { immediate: true, flush: 'post' }
)

watch(
  () => viewer.sourcePath,
  (sourcePath) => {
    if (!sourcePath) return
    if (tree.value.length === 0) return
    expandAncestorsForSourcePath(sourcePath)
    syncFocusedIndexToSelectedRow()
    if (activeSourcePathInitialized) {
      void scrollSelectedIntoView()
    }
    activeSourcePathInitialized = true
  },
  { immediate: true, flush: 'post' }
)

function isExpanded(node: TreeNode): boolean {
  return expanded.value.has(node.relPath)
}

function isTopLevelFolder(node: TreeNode): boolean {
  return node.isFolder && node.depth === 0
}

function sortModeFor(node: TreeNode): WorkspaceFolderSortMode {
  return workspace.library.folderSortModes[node.relPath] ?? 'az'
}

function toggleSortMenu(node: TreeNode, event: MouseEvent): void {
  const opening = openSortMenuFor.value !== node.relPath
  openSortMenuFor.value = opening ? node.relPath : null
  sortMenuAnchor.value = opening ? (event.currentTarget as HTMLElement) : null
}

const sortMenuNode = computed(
  () => visibleRows.value.find((row) => row.relPath === openSortMenuFor.value) ?? null
)

function setFolderSortMode(node: TreeNode, mode: WorkspaceFolderSortMode): void {
  const folderSortModes = { ...workspace.library.folderSortModes }
  if (mode === 'az') {
    delete folderSortModes[node.relPath]
  } else {
    folderSortModes[node.relPath] = mode
  }
  openSortMenuFor.value = null
  void workspace.updateLibrary({ folderSortModes }).catch(() => {
    // The workspace store owns the user-facing error state for persistence failures.
  })
}

function openFileContextMenu(event: MouseEvent, node: TreeNode, index: number): void {
  if (node.isFolder) return
  focusedIndex.value = index
  openSortMenuFor.value = null
  inlineRename.value = null
  fileContextMenu.value = {
    sourcePath: node.relPath,
    name: node.name,
    x: event.clientX,
    y: event.clientY
  }
}

function startInlineRename(sourcePath: string): void {
  inlineRename.value = { sourcePath }
}

function cancelInlineRename(sourcePath: string): void {
  if (inlineRename.value?.sourcePath === sourcePath) inlineRename.value = null
}

async function submitInlineRename(node: TreeNode, name: string): Promise<void> {
  const editing = inlineRename.value
  if (!editing || editing.sourcePath !== node.relPath) return
  if (name === node.name) {
    inlineRename.value = null
    return
  }

  try {
    await workspace.renameFile({ sourcePath: node.relPath, name })
    inlineRename.value = null
    await Promise.all([viewer.refreshTree(), catalog.refreshCatalog()])
  } catch {
    // Keep the editor mounted; the workspace error is visible in the status bar.
  }
}

async function handleFileContextAction(action: FileContextMenuAction): Promise<void> {
  const menu = fileContextMenu.value
  if (!menu) return
  fileContextMenu.value = null
  const file = { sourcePath: menu.sourcePath }

  try {
    if (action === 'rename') {
      startInlineRename(menu.sourcePath)
      return
    }
    if (action === 'copy-file') {
      await workspace.copyFile(file)
      return
    }
    if (action === 'copy-file-path') {
      await workspace.copyFilePath(file)
      return
    }
    if (action === 'show-in-finder') {
      await workspace.showFileInFinder(file)
      return
    }
    if (action === 'move-to-trash' && (await workspace.moveFileToTrash(file))) {
      await Promise.all([viewer.refreshTree(), catalog.refreshCatalog()])
    }
  } catch {
    // The workspace store exposes the actionable error through the status bar.
  }
}

function sameStringList(left: string[] | null, right: string[]): boolean {
  if (left === null || left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function sortedExpandedFolders(next: Set<string>): string[] {
  return [...next].sort((a, b) => a.localeCompare(b))
}

function persistExpandedFolders(next: Set<string>): void {
  const expandedFolders = sortedExpandedFolders(next)
  if (sameStringList(workspace.library.expandedFolders, expandedFolders)) return
  void workspace.updateLibrary({ expandedFolders }).catch(() => {
    // The workspace store owns the user-facing error state for persistence failures.
  })
}

function expandAncestorsForSourcePath(sourcePath: string): void {
  const parts = sourcePath.split('/')
  parts.pop()
  if (parts.length === 0) return

  const next = new Set(expanded.value)
  let changed = false
  for (let index = 0; index < parts.length; index += 1) {
    const ancestor = parts.slice(0, index + 1).join('/')
    if (next.has(ancestor)) continue
    next.add(ancestor)
    changed = true
  }

  if (!changed) return
  expanded.value = next
  persistExpandedFolders(next)
}

function toggle(node: TreeNode): void {
  const next = new Set(expanded.value)
  if (next.has(node.relPath)) {
    next.delete(node.relPath)
  } else {
    next.add(node.relPath)
  }
  expanded.value = next
  persistExpandedFolders(next)
}

function onRowClick(node: TreeNode, index: number): void {
  rootEl.value?.focus({ preventScroll: true })
  focusedIndex.value = index
  if (node.isFolder) {
    toggle(node)
  } else {
    void workspace.openOrFocusFile({ sourcePath: node.relPath })
  }
}

function rowStyle(node: TreeNode): Record<string, string> | undefined {
  if (node.depth <= 0) return undefined

  return {
    '--tree-depth-offset': `${node.depth * TREE_DEPTH_INDENT_EM}em`
  }
}

function fileIconFor(fileName: string): IconName {
  return resolveFileIconName(fileName)
}

function treeConnectorStyle(connector: TreeConnector): Record<string, string> {
  const top =
    TREE_PADDING_Y_PX + connector.startIndex * TREE_ROW_HEIGHT_PX - TREE_CONNECTOR_OVERHANG_PX
  const height = connector.rowCount * TREE_ROW_HEIGHT_PX + TREE_CONNECTOR_OVERHANG_PX * 2

  return {
    left: `${
      TREE_PADDING_X_PX +
      TREE_ROW_PADDING_LEFT_PX +
      connector.depth * TREE_DEPTH_INDENT_PX +
      CHEVRON_CENTER_PX
    }px`,
    top: `${top}px`,
    height: `${height}px`
  }
}

async function scrollFocusedIntoView(): Promise<void> {
  await nextTick()
  const el = rootEl.value?.querySelector<HTMLElement>(`[data-row-index="${focusedIndex.value}"]`)
  el?.scrollIntoView({ block: 'nearest' })
}

async function scrollSelectedIntoView(): Promise<void> {
  await nextTick()
  const sourcePath = viewer.sourcePath
  if (!sourcePath) return
  const selectedIndex = visibleRows.value.findIndex(
    (row) => !row.isFolder && row.relPath === sourcePath
  )
  if (selectedIndex === -1) return
  const el = rootEl.value?.querySelector<HTMLElement>(`[data-row-index="${selectedIndex}"]`)
  el?.scrollIntoView({ block: 'nearest' })
}

function syncFocusedIndexToSelectedRow(): void {
  const sourcePath = viewer.sourcePath
  if (!sourcePath) return
  const selectedIndex = visibleRows.value.findIndex(
    (row) => !row.isFolder && row.relPath === sourcePath
  )
  if (selectedIndex !== -1) focusedIndex.value = selectedIndex
}

async function restoreLibraryScroll(): Promise<void> {
  if (libraryScrollRestored || !rootEl.value || visibleRows.value.length === 0) return
  await nextTick()
  if (!rootEl.value) return
  restoringLibraryScroll = true
  rootEl.value.scrollTop = workspace.library.scrollTop
  libraryScrollRestored = true
  window.setTimeout(() => {
    restoringLibraryScroll = false
  }, 0)
}

function persistLibraryScroll(): void {
  const scrollTop = Math.round(rootEl.value?.scrollTop ?? 0)
  if (scrollTop === workspace.library.scrollTop) return
  void workspace.updateLibrary({ scrollTop }).catch(() => {
    // The workspace store owns the user-facing error state for persistence failures.
  })
}

function onScroll(): void {
  if (restoringLibraryScroll) return
  if (scrollPersistTimer !== null) {
    window.clearTimeout(scrollPersistTimer)
  }
  scrollPersistTimer = window.setTimeout(() => {
    scrollPersistTimer = null
    persistLibraryScroll()
  }, 150)
}

function onFocusIn(): void {
  treeHasFocus.value = true
}

function onFocusOut(event: FocusEvent): void {
  const nextTarget = event.relatedTarget
  if (nextTarget instanceof Node && rootEl.value?.contains(nextTarget)) return
  treeHasFocus.value = false
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Node && rootEl.value?.contains(target)) return
  treeHasFocus.value = false
  rootEl.value?.blur()
}

function onKeydown(event: KeyboardEvent): void {
  const rows = visibleRows.value
  if (rows.length === 0) return
  const current = rows[focusedIndex.value]

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      focusedIndex.value = Math.min(rows.length - 1, focusedIndex.value + 1)
      void scrollFocusedIntoView()
      break
    case 'ArrowUp':
      event.preventDefault()
      focusedIndex.value = Math.max(0, focusedIndex.value - 1)
      void scrollFocusedIntoView()
      break
    case 'ArrowRight':
      event.preventDefault()
      if (current?.isFolder && !isExpanded(current)) {
        toggle(current)
      }
      break
    case 'ArrowLeft':
      event.preventDefault()
      if (current?.isFolder && isExpanded(current)) {
        toggle(current)
      }
      break
    case 'Enter':
      event.preventDefault()
      if (current && !current.isFolder) {
        void workspace.openOrFocusFile({ sourcePath: current.relPath })
      } else if (current?.isFolder) {
        toggle(current)
      }
      break
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  void catalog.hydrate()
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  catalog.unbind()
  if (scrollPersistTimer !== null) {
    window.clearTimeout(scrollPersistTimer)
    scrollPersistTimer = null
  }
  persistLibraryScroll()
})
</script>

<template>
  <nav
    ref="rootEl"
    class="sidebar ryte-scrollbar ryte-scrollbar--y"
    :aria-label="'Notes file tree'"
    tabindex="0"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
    @keydown="onKeydown"
    @scroll="onScroll"
  >
    <StText v-if="!viewer.notesRoot" as="p" size="compact" tone="muted" class="empty-sidebar">
      Loading…
    </StText>
    <StText
      v-else-if="visibleRows.length === 0"
      as="p"
      size="compact"
      tone="muted"
      class="empty-sidebar"
    >
      No markdown files found.
    </StText>
    <div v-else class="tree-frame">
      <div class="tree-connectors" aria-hidden="true">
        <span
          v-for="connector in treeConnectors"
          :key="connector.key"
          class="tree-connector"
          :style="treeConnectorStyle(connector)"
        />
      </div>
      <ul role="tree" class="tree">
        <li
          v-for="(node, index) in visibleRows"
          :key="node.relPath"
          role="treeitem"
          :aria-expanded="node.isFolder ? isExpanded(node) : undefined"
          :aria-current="!node.isFolder && viewer.sourcePath === node.relPath ? 'true' : undefined"
          :data-row-index="index"
          :class="[
            'row',
            {
              folder: node.isFolder,
              file: !node.isFolder,
              focused: treeHasFocus && focusedIndex === index,
              selected: !node.isFolder && viewer.sourcePath === node.relPath
            }
          ]"
          :style="rowStyle(node)"
          @click="onRowClick(node, index)"
          @contextmenu.prevent.stop="openFileContextMenu($event, node, index)"
        >
          <span v-if="node.isFolder" class="chevron" :class="{ open: isExpanded(node) }">
            <StIcon name="chevron-right" :size="14" />
          </span>
          <StIcon v-else :name="fileIconFor(node.name)" :size="12" class="file-icon" />
          <InlineFileRename
            v-if="!node.isFolder && inlineRename?.sourcePath === node.relPath"
            :name="node.name"
            :label="`Rename ${node.name}`"
            variant="sidebar"
            @submit="submitInlineRename(node, $event)"
            @cancel="cancelInlineRename(node.relPath)"
          />
          <span v-else class="name">{{ node.name }}</span>
          <button
            v-if="isTopLevelFolder(node)"
            type="button"
            class="sort-menu-button"
            :class="{ open: openSortMenuFor === node.relPath }"
            :aria-label="`Sort ${node.name}`"
            aria-haspopup="menu"
            :aria-expanded="openSortMenuFor === node.relPath"
            @click.stop="toggleSortMenu(node, $event)"
          >
            <StIcon name="more-vertical" :size="14" />
          </button>
        </li>
      </ul>
    </div>
  </nav>
  <StMenu
    :open="sortMenuNode !== null"
    :anchor="sortMenuAnchor"
    :label="`Sort ${sortMenuNode?.name ?? ''}`"
    align="end"
    @dismiss="openSortMenuFor = null"
  >
    <StMenuLabel>Sort by</StMenuLabel>
    <StMenuItem
      v-for="option in SORT_OPTIONS"
      :key="option.mode"
      role="menuitemradio"
      :checked="sortMenuNode !== null && sortModeFor(sortMenuNode) === option.mode"
      @click="sortMenuNode && setFolderSortMode(sortMenuNode, option.mode)"
    >
      {{ option.label }}
    </StMenuItem>
  </StMenu>
  <FileContextMenu
    v-if="fileContextMenu"
    :x="fileContextMenu.x"
    :y="fileContextMenu.y"
    :file-name="fileContextMenu.name"
    @action="handleFileContextAction"
    @dismiss="fileContextMenu = null"
  />
</template>

<style scoped>
.sidebar {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  outline: none;
  font-size: var(--st-type-body-compact-size);
}

.sidebar:focus-visible {
  outline: var(--st-border-200) solid var(--st-color-border-selected);
  outline-offset: var(--st-space-25-negative);
}

.empty-sidebar {
  padding: var(--st-space-200);
}

.empty-sidebar code {
  font-family: var(--st-type-code-md-family);
  font-size: var(--st-type-code-md-size);
  color: var(--st-color-text-muted);
  word-break: break-all;
}

.tree-frame {
  position: relative;
}

.tree-connectors {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}

.tree {
  position: relative;
  z-index: 1;
  list-style: none;
  margin: 0;
  padding: var(--st-space-100) var(--st-space-150);
}

.row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.889em;
  padding-block: 0.583em;
  padding-right: 0.25em;
  padding-left: calc(0.25em + var(--tree-depth-offset, 0px));
  border-radius: 0.5em;
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
  color: var(--st-color-text-secondary);
  font-size: var(--st-type-body-sm-size);
  height: 2.167em;
  line-height: var(--st-type-body-sm-leading);
}

.tree-connector {
  position: absolute;
  width: var(--st-block-1);
  pointer-events: none;
  background: var(--st-color-surface-active);
}

.row:hover {
  background: var(--st-color-surface-hover);
}

.row.folder {
  font-weight: var(--st-font-weight-medium);
  color: var(--st-color-text-primary);
}

.row.focused {
  background: var(--st-color-surface-hover);
  box-shadow: inset 0 0 0 var(--st-border-100) var(--st-color-accent);
}

.row.selected {
  background: var(--st-color-surface-selected);
  color: var(--st-color-text-strong);
}

.row.selected.focused {
  background: var(--st-color-surface-selected);
}

.chevron {
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--st-block-175);
  height: var(--st-block-175);
  color: var(--st-color-text-strong);
  transition: transform 120ms;
}

.chevron.open {
  transform: rotate(90deg);
}

.file-icon {
  position: relative;
  z-index: 2;
  color: var(--st-color-text-secondary);
}

.name {
  position: relative;
  z-index: 2;
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sort-menu-button {
  position: relative;
  z-index: 3;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: var(--st-block-250);
  height: var(--st-block-250);
  margin-block: var(--st-space-50-negative);
  margin-left: auto;
  border: 0;
  border-radius: 0.3em;
  background: transparent;
  color: var(--st-color-text-secondary);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
}

.row:hover .sort-menu-button,
.row:focus-within .sort-menu-button,
.sort-menu-button.open {
  opacity: 1;
  pointer-events: auto;
}

.sort-menu-button:hover,
.sort-menu-button.open,
.sort-menu-button:focus-visible {
  background: var(--st-color-surface-active);
  color: var(--st-color-text-strong);
}

.sort-menu-button:focus-visible {
  outline: var(--st-border-200) solid var(--st-color-focus);
  outline-offset: var(--st-space-1);
}
</style>
