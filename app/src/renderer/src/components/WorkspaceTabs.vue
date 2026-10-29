<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type ComponentPublicInstance
} from 'vue'

import { useWorkspaceStore } from '../stores/workspace'
import {
  isWorkspaceSourceFileRef,
  workspaceFileDisplayPath,
  type WorkspaceFileRef,
  type WorkspaceFileTab
} from '../../../shared/workspace'
import StIconButton from '../stencil/components/StIconButton.vue'
import FileContextMenu from './FileContextMenu.vue'
import type { FileContextMenuAction } from './file-context-menu-model'
import InlineFileRename from './InlineFileRename.vue'
import {
  WORKSPACE_TABPANEL_ID,
  getCloseFallbackWorkspaceTabId,
  getWorkspaceTabDomId,
  resolveGlobalWorkspaceTabShortcut,
  resolveTablistKeyboardAction
} from './workspace-tab-keyboard'
import { resolveOverflowEdges, resolveScrollDelta } from './workspace-tab-scroll'

const workspace = useWorkspaceStore()
const TAB_SCROLL_MARGIN = 8

interface TabFileContextMenu {
  tabId: string
  fileName: string
  x: number
  y: number
}

interface TabInlineRename {
  tabId: string
}

const hasTabs = computed(() => workspace.tabs.length > 0)
const tabListRef = ref<HTMLElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
const screenReaderStatus = ref('')
const fileContextMenu = ref<TabFileContextMenu | null>(null)
const inlineRename = ref<TabInlineRename | null>(null)
const tabElements = new Map<string, HTMLElement>()
const tabButtonElements = new Map<string, HTMLButtonElement>()
let resizeObserver: ResizeObserver | null = null
let scrollFrame: number | null = null

const tabIds = computed(() => workspace.tabs.map((tab) => tab.id))
const tabListClasses = computed(() => ({
  'has-left-fade': canScrollLeft.value,
  'has-right-fade': canScrollRight.value
}))

function setTabListRef(element: Element | ComponentPublicInstance | null): void {
  tabListRef.value = element instanceof HTMLElement ? element : null
}

function setTabElement(tabId: string, element: Element | ComponentPublicInstance | null): void {
  if (element instanceof HTMLElement) {
    tabElements.set(tabId, element)
    return
  }
  tabElements.delete(tabId)
}

function setTabButtonElement(
  tabId: string,
  element: Element | ComponentPublicInstance | null
): void {
  if (element instanceof HTMLButtonElement) {
    tabButtonElements.set(tabId, element)
    return
  }
  tabButtonElements.delete(tabId)
}

function focusTabButton(tabId: string): void {
  void nextTick(() => {
    tabButtonElements.get(tabId)?.focus()
  })
}

function scrollTabIntoView(tabId: string): void {
  const list = tabListRef.value
  const tab = tabElements.get(tabId)
  if (!list || !tab) return

  const listRect = list.getBoundingClientRect()
  const tabRect = tab.getBoundingClientRect()
  const delta = resolveScrollDelta({
    viewportStart: listRect.left,
    viewportEnd: listRect.right,
    itemStart: tabRect.left,
    itemEnd: tabRect.right,
    margin: TAB_SCROLL_MARGIN
  })

  if (delta !== 0) list.scrollLeft += delta
  updateScrollEdges()
}

function updateScrollEdges(): void {
  const list = tabListRef.value
  if (!list) {
    canScrollLeft.value = false
    canScrollRight.value = false
    return
  }

  const edges = resolveOverflowEdges({
    scrollLeft: list.scrollLeft,
    scrollWidth: list.scrollWidth,
    clientWidth: list.clientWidth
  })
  canScrollLeft.value = edges.canScrollLeft
  canScrollRight.value = edges.canScrollRight
}

function syncTabLayout(): void {
  if (scrollFrame !== null) {
    window.cancelAnimationFrame(scrollFrame)
  }

  void nextTick(() => {
    if (scrollFrame !== null) {
      window.cancelAnimationFrame(scrollFrame)
    }
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = null
      if (workspace.activeTabId) scrollTabIntoView(workspace.activeTabId)
      updateScrollEdges()
    })
  })
}

watch(
  () => tabListRef.value,
  (list) => {
    resizeObserver?.disconnect()
    resizeObserver = null
    if (list) {
      resizeObserver = new ResizeObserver(syncTabLayout)
      resizeObserver.observe(list)
    }
    syncTabLayout()
  },
  { flush: 'post' }
)

watch(
  () => [workspace.activeTabId, workspace.tabs.map((tab) => tab.id).join('|')] as const,
  () => syncTabLayout(),
  { flush: 'post', immediate: true }
)

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown, true)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame)
  window.removeEventListener('keydown', onGlobalKeydown, true)
})

function tabDomId(tabId: string): string {
  return getWorkspaceTabDomId(tabId)
}

function tabPanelId(): string {
  return WORKSPACE_TABPANEL_ID
}

function tabIndex(tabId: string): 0 | -1 {
  return workspace.activeTabId === tabId ? 0 : -1
}

function tabAccessibleLabel(title: string, sourcePath: string): string {
  return title === sourcePath ? title : `${title}, ${sourcePath}`
}

function tabDisplayPath(tab: WorkspaceFileTab): string {
  return workspaceFileDisplayPath(tab)
}

function fileRefForTab(tab: WorkspaceFileTab): WorkspaceFileRef {
  return isWorkspaceSourceFileRef(tab)
    ? { sourcePath: tab.sourcePath }
    : { externalPath: tab.externalPath }
}

function openTabContextMenu(event: MouseEvent, tab: WorkspaceFileTab): void {
  inlineRename.value = null
  fileContextMenu.value = {
    tabId: tab.id,
    fileName: tab.title,
    x: event.clientX,
    y: event.clientY
  }
}

function startInlineRename(tab: WorkspaceFileTab): void {
  inlineRename.value = { tabId: tab.id }
}

function cancelInlineRename(tabId: string): void {
  if (inlineRename.value?.tabId === tabId) inlineRename.value = null
}

async function submitInlineRename(tab: WorkspaceFileTab, name: string): Promise<void> {
  const editing = inlineRename.value
  if (!editing || editing.tabId !== tab.id) return
  if (name === tab.title) {
    inlineRename.value = null
    return
  }

  try {
    await workspace.renameFile({ ...fileRefForTab(tab), name })
    inlineRename.value = null
    announce(`Renamed ${tab.title} to ${name}`)
  } catch {
    announce(workspace.error ?? `Could not rename ${tab.title}`)
  }
}

function announce(message: string): void {
  screenReaderStatus.value = ''
  void nextTick(() => {
    screenReaderStatus.value = message
  })
}

function isFocusInsideTabs(): boolean {
  const activeElement = document.activeElement
  return activeElement instanceof HTMLElement && Boolean(activeElement.closest('.workspace-tabs'))
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target.closest('[contenteditable="true"]')) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function hasModalOpen(): boolean {
  return document.querySelector('[aria-modal="true"], .file-context-menu') !== null
}

function focusFallbackShellControl(): void {
  document.querySelector<HTMLElement>('[data-workspace-fallback-focus]')?.focus()
}

function focusTab(
  tabId: string,
  options: { moveKeyboardFocus?: boolean; announceSelection?: boolean } = {}
): void {
  if (workspace.activeTabId === tabId) {
    void nextTick(() => {
      scrollTabIntoView(tabId)
      if (options.moveKeyboardFocus) {
        focusTabButton(tabId)
      }
    })
    return
  }
  void workspace.focusTab({ tabId })
  void nextTick(() => {
    scrollTabIntoView(tabId)
    if (options.moveKeyboardFocus) {
      focusTabButton(tabId)
    }
    if (options.announceSelection) {
      const selectedTab = workspace.tabs.find((tab) => tab.id === tabId)
      if (selectedTab) announce(`Selected ${tabDisplayPath(selectedTab)}`)
    }
  })
}

function closeTabWithFocusRecovery(
  tabId: string,
  options: { moveKeyboardFocus?: boolean; announceClose?: boolean } = {}
): void {
  const closingTab = workspace.tabs.find((tab) => tab.id === tabId)
  const fallbackTabId = getCloseFallbackWorkspaceTabId(tabIds.value, tabId)
  void workspace.closeTab({ tabId })
  void nextTick(() => {
    const shouldRecoverBodyFocus = document.activeElement === document.body
    if (fallbackTabId && (options.moveKeyboardFocus || shouldRecoverBodyFocus)) {
      focusTabButton(fallbackTabId)
      return
    }
    if (!fallbackTabId && (options.moveKeyboardFocus || shouldRecoverBodyFocus)) {
      focusFallbackShellControl()
    }
  })
  if (closingTab && options.announceClose) {
    announce(`Closed ${tabDisplayPath(closingTab)}`)
  }
}

function closeTab(event: MouseEvent, tabId: string): void {
  event.stopPropagation()
  const target = event.currentTarget
  const shouldRecoverFocus =
    target instanceof HTMLElement && (event.detail === 0 || document.activeElement === target)

  closeTabWithFocusRecovery(tabId, {
    moveKeyboardFocus: shouldRecoverFocus,
    announceClose: shouldRecoverFocus
  })
}

async function handleFileContextAction(action: FileContextMenuAction): Promise<void> {
  const menu = fileContextMenu.value
  if (!menu) return
  fileContextMenu.value = null
  const tab = workspace.tabs.find((candidate) => candidate.id === menu.tabId)
  if (!tab) return

  if (action === 'rename') {
    startInlineRename(tab)
    return
  }
  if (action === 'close') {
    closeTabWithFocusRecovery(tab.id, { moveKeyboardFocus: true, announceClose: true })
    return
  }

  const file = fileRefForTab(tab)
  try {
    if (action === 'copy-file') {
      await workspace.copyFile(file)
      announce(`Copied ${tab.title}`)
      return
    }
    if (action === 'copy-file-path') {
      await workspace.copyFilePath(file)
      announce(`Copied path for ${tab.title}`)
      return
    }
    if (action === 'show-in-finder') {
      await workspace.showFileInFinder(file)
      return
    }
    if (action === 'move-to-trash' && (await workspace.moveFileToTrash(file))) {
      announce(`Moved ${tab.title} to Trash`)
      void nextTick(() => {
        if (workspace.activeTabId) {
          focusTabButton(workspace.activeTabId)
        } else {
          focusFallbackShellControl()
        }
      })
    }
  } catch {
    announce(workspace.error ?? `Could not update ${tab.title}`)
  }
}

function onTabKeydown(event: KeyboardEvent, tabId: string): void {
  const action = resolveTablistKeyboardAction(event, tabIds.value, tabId)
  if (!action) return

  event.preventDefault()
  event.stopPropagation()

  if (action.type === 'close') {
    closeTabWithFocusRecovery(action.tabId, { moveKeyboardFocus: true, announceClose: true })
    return
  }

  focusTab(action.tabId, { moveKeyboardFocus: true })
}

function onGlobalKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || isEditableKeyboardTarget(event.target) || hasModalOpen()) return

  const action = resolveGlobalWorkspaceTabShortcut(event, tabIds.value, workspace.activeTabId)
  if (!action) return

  event.preventDefault()
  event.stopPropagation()

  if (action.type === 'close-active') {
    if (workspace.activeTabId) {
      closeTabWithFocusRecovery(workspace.activeTabId, {
        moveKeyboardFocus: isFocusInsideTabs(),
        announceClose: true
      })
    }
    return
  }

  const focusStartedInsideTabs = isFocusInsideTabs()
  focusTab(action.tabId, {
    moveKeyboardFocus: true,
    announceSelection: !focusStartedInsideTabs
  })
}
</script>

<template>
  <nav v-if="hasTabs" class="workspace-tabs" aria-label="Open files">
    <p id="workspace-tabs-instructions" class="sr-only">
      Use Left and Right Arrow to switch tabs, Home and End to jump, Delete or Backspace to close
      the focused tab, Command W to close the current tab, or Shift Command Left Bracket and Shift
      Command Right Bracket to switch tabs from anywhere.
    </p>
    <div
      :ref="setTabListRef"
      class="tab-list ryte-scrollbar ryte-scrollbar--x"
      :class="tabListClasses"
      @scroll="updateScrollEdges"
    >
      <div
        class="tab-track"
        role="tablist"
        aria-label="Workspace tabs"
        aria-orientation="horizontal"
        aria-describedby="workspace-tabs-instructions"
      >
        <div
          v-for="tab in workspace.tabs"
          :key="tab.id"
          :ref="(element) => setTabElement(tab.id, element)"
          class="tab-item"
          :class="{ active: workspace.activeTabId === tab.id }"
          role="presentation"
          @contextmenu.prevent.stop="openTabContextMenu($event, tab)"
        >
          <InlineFileRename
            v-if="inlineRename?.tabId === tab.id"
            :name="tab.title"
            :label="`Rename ${tab.title}`"
            variant="tab"
            @submit="submitInlineRename(tab, $event)"
            @cancel="cancelInlineRename(tab.id)"
          />
          <button
            v-else
            :id="tabDomId(tab.id)"
            :ref="(element) => setTabButtonElement(tab.id, element)"
            type="button"
            class="tab-focus"
            role="tab"
            :aria-selected="workspace.activeTabId === tab.id"
            :aria-controls="tabPanelId()"
            :aria-label="tabAccessibleLabel(tab.title, tabDisplayPath(tab))"
            aria-describedby="workspace-tabs-instructions"
            aria-keyshortcuts="ArrowLeft ArrowRight Home End Delete Backspace Enter Space Meta+W Meta+Shift+[ Meta+Shift+]"
            :tabindex="tabIndex(tab.id)"
            :title="tabDisplayPath(tab)"
            @click="focusTab(tab.id)"
            @keydown="onTabKeydown($event, tab.id)"
          >
            <span class="tab-title">{{ tab.title }}</span>
          </button>
          <StIconButton
            class="tab-close"
            icon="close"
            size="sm"
            :label="`Close ${tabDisplayPath(tab)}`"
            tabindex="-1"
            @click="closeTab($event, tab.id)"
          />
        </div>
      </div>
    </div>
    <span class="sr-only" aria-live="polite" aria-atomic="true">{{ screenReaderStatus }}</span>
  </nav>
  <FileContextMenu
    v-if="fileContextMenu"
    :x="fileContextMenu.x"
    :y="fileContextMenu.y"
    :file-name="fileContextMenu.fileName"
    can-close
    @action="handleFileContextAction"
    @dismiss="fileContextMenu = null"
  />
</template>

<style scoped>
.workspace-tabs {
  flex: 1 1 auto;
  align-self: stretch;
  display: flex;
  align-items: stretch;
  min-width: 0;
  padding-block-start: var(--st-space-100);
  padding-inline-end: var(--st-space-200);
  background: transparent;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

.sr-only {
  position: absolute;
  width: var(--st-block-1);
  height: var(--st-block-1);
  padding: 0;
  margin: var(--st-space-1-negative);
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.tab-list {
  --tab-fade-size: var(--st-block-300);
  --tab-scrollbar-strip: var(--st-space-75);
  flex: 1 1 auto;
  min-width: 0;
  height: calc(100% - var(--st-block-25));
  overflow-x: auto;
  overflow-y: hidden;
}

.tab-list.has-left-fade {
  --tab-edge-mask: linear-gradient(
    to right,
    transparent 0,
    var(--st-neutral-black) var(--tab-fade-size),
    var(--st-neutral-black) 100%
  );
}

.tab-list.has-right-fade {
  --tab-edge-mask: linear-gradient(
    to right,
    var(--st-neutral-black) 0,
    var(--st-neutral-black) calc(100% - var(--tab-fade-size)),
    transparent 100%
  );
}

.tab-list.has-left-fade.has-right-fade {
  --tab-edge-mask: linear-gradient(
    to right,
    transparent 0,
    var(--st-neutral-black) var(--tab-fade-size),
    var(--st-neutral-black) calc(100% - var(--tab-fade-size)),
    transparent 100%
  );
}

.tab-list.has-left-fade,
.tab-list.has-right-fade {
  -webkit-mask-image:
    var(--tab-edge-mask), linear-gradient(var(--st-neutral-black), var(--st-neutral-black));
  -webkit-mask-position:
    top left,
    bottom left;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-size:
    100% calc(100% - var(--tab-scrollbar-strip)),
    100% var(--tab-scrollbar-strip);
  mask-image:
    var(--tab-edge-mask), linear-gradient(var(--st-neutral-black), var(--st-neutral-black));
  mask-mode: alpha;
  mask-position:
    top left,
    bottom left;
  mask-repeat: no-repeat;
  mask-size:
    100% calc(100% - var(--tab-scrollbar-strip)),
    100% var(--tab-scrollbar-strip);
}

.tab-track {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: var(--st-space-25);
  width: max-content;
}

.tab-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--st-space-75);
  flex: 0 0 auto;
  min-width: 0;
  max-width: calc(var(--st-layout-250) + var(--st-block-600));
  padding: var(--st-space-75) var(--st-space-100) var(--st-space-100) var(--st-space-200);
  border-radius: var(--st-space-100);
  background: transparent;
  color: var(--st-color-text-secondary);
  transition-duration: 250ms;
  transition-property: background-color, color;
  transition-timing-function: ease-out;
}

.tab-item.active {
  color: var(--st-color-text-strong);
  background: color-mix(in oklab, var(--st-color-surface-base) 25%, transparent);
}

.tab-item:focus-within {
  outline: var(--st-border-200) solid var(--st-color-focus);
  outline-offset: var(--st-space-25-negative);
}

.tab-focus {
  min-width: 0;
  flex: 0 1 auto;
  display: inline-flex;
  align-items: center;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--st-type-body-sm-size);
  line-height: var(--st-type-body-sm-leading);
  cursor: pointer;
}

.tab-focus:focus-visible,
.tab-close:focus-visible {
  outline: 0;
}

.tab-item:hover {
  background: color-mix(in oklab, var(--st-color-surface-base) 35%, transparent);
  transition-duration: 25ms;
  transition-timing-function: ease-in;
}

.tab-item.active:hover {
  background: color-mix(in oklab, var(--st-color-surface-base) 35%, transparent);
  transition-duration: 25ms;
  transition-timing-function: ease-in;
}

.tab-title {
  display: block;
  min-width: 0;
  max-width: var(--st-layout-250);
  direction: rtl;
  overflow: hidden;
  line-height: 120%;
  text-align: left;
  text-overflow: ellipsis;
  unicode-bidi: plaintext;
  white-space: nowrap;
}

.tab-item .tab-close {
  color: var(--st-color-text-muted);
}

.tab-item.active .tab-close,
.tab-item .tab-close:hover,
.tab-item .tab-close:focus-visible {
  color: var(--st-color-text-strong);
}
</style>
