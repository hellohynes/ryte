<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { DEFAULT_FONT_ID } from '../../../shared/fonts'
import { applyFont } from '../fonts/load-fonts'
import { renderMermaidDiagrams } from '../markdown/mermaid'
import {
  renderDocument,
  type MarkdownOutlineItem,
  type RenderedMarkdownDocument
} from '../markdown/renderer'
import { useSettingsStore } from '../stores/settings'
import { useViewerStore } from '../stores/viewer'
import { useWorkspaceStore } from '../stores/workspace'
import {
  DOCUMENT_OUTLINE_COLLAPSED_WIDTH,
  clampDocumentOutlineWidth
} from '../../../shared/workspace'
import StIconButton from '../stencil/components/StIconButton.vue'
import StProse from '../stencil/components/StProse.vue'
import { WORKSPACE_TABPANEL_ID, getWorkspaceTabDomId } from './workspace-tab-keyboard'

const viewer = useViewerStore()
const settings = useSettingsStore()
const workspace = useWorkspaceStore()
const renderedHtml = ref<string>('')
const documentOutline = ref<MarkdownOutlineItem[]>([])
const renderError = ref<string | null>(null)
const renderCache = new Map<string, RenderedMarkdownDocument>()
const proseRef = ref<InstanceType<typeof StProse> | null>(null)
const proseEl = computed<HTMLElement | null>(() => (proseRef.value?.$el as HTMLElement) ?? null)
const sourceEl = ref<HTMLElement | null>(null)
const fallbackOutlineCollapsed = ref(false)
const dragOutlineWidth = ref<number | null>(null)
const activeOutlineId = ref('overview')

let _stopOutlineResize: (() => void) | undefined

const filenameDisplay = computed(() => {
  return viewer.displayPath ?? ''
})
const activeTabPanelLabelledBy = computed(() =>
  workspace.activeTabId ? getWorkspaceTabDomId(workspace.activeTabId) : undefined
)
const sectionOutline = computed(() =>
  documentOutline.value.filter((item) => item.level >= 2 && item.level <= 4)
)
const outlineParentById = computed(() => {
  const parents = new Map<string, string>()
  let currentSectionId: string | null = null

  for (const item of sectionOutline.value) {
    if (item.level === 2) {
      currentSectionId = item.id
      parents.set(item.id, item.id)
    } else if (currentSectionId) {
      parents.set(item.id, currentSectionId)
    }
  }

  return parents
})
const activeSectionId = computed(() =>
  activeOutlineId.value === 'overview'
    ? null
    : (outlineParentById.value.get(activeOutlineId.value) ?? null)
)
const visibleSectionOutline = computed(() =>
  sectionOutline.value.filter((item) => {
    if (item.level === 2) return true
    return outlineParentById.value.get(item.id) === activeSectionId.value
  })
)
const hasDocumentOutline = computed(
  () => !viewer.sourceMode && !viewer.loading && !viewer.error && sectionOutline.value.length > 0
)
const outlineSourcePath = computed(() => viewer.sourcePath)
const isOutlineCollapsed = computed(() => {
  const sourcePath = outlineSourcePath.value
  if (!sourcePath) return fallbackOutlineCollapsed.value
  return workspace.outlineCollapsedByPath[sourcePath] === true
})
const documentOutlineWidth = computed(
  () => dragOutlineWidth.value ?? clampDocumentOutlineWidth(workspace.outlineWidth)
)
const documentOutlineStyle = computed(() => {
  const width = isOutlineCollapsed.value
    ? DOCUMENT_OUTLINE_COLLAPSED_WIDTH
    : documentOutlineWidth.value
  return {
    width: `${width}px`,
    flexBasis: `${width}px`
  }
})

async function updateRender(text: string): Promise<void> {
  if (renderCache.has(text)) {
    const cached = renderCache.get(text)!
    renderedHtml.value = cached.html
    documentOutline.value = cached.outline
    return
  }
  const document = await renderDocument(text, { interactiveTasks: true })
  renderCache.set(text, document)
  // Bound cache to avoid unbounded growth on many file edits in one session.
  if (renderCache.size > 50) {
    const firstKey = renderCache.keys().next().value
    if (firstKey) renderCache.delete(firstKey)
  }
  // Only commit the result if the content hasn't changed in the meantime
  // (user may have switched files while we were rendering).
  if (text === viewer.content) {
    renderedHtml.value = document.html
    documentOutline.value = document.outline
  }
}

async function hydrateRenderedContent(): Promise<void> {
  await nextTick()
  if (viewer.sourceMode || !proseEl.value) return
  await renderMermaidDiagrams(proseEl.value)
  updateActiveOutline()
}

watch(
  () => viewer.content,
  (next) => {
    renderError.value = null
    if (!next) {
      renderedHtml.value = ''
      documentOutline.value = []
      return
    }
    updateRender(next).catch((err) => {
      renderError.value = err instanceof Error ? err.message : String(err)
      renderedHtml.value = ''
      documentOutline.value = []
    })
  },
  { immediate: true }
)

watch(
  [renderedHtml, () => viewer.sourceMode],
  () => {
    hydrateRenderedContent().catch((err) => {
      renderError.value = err instanceof Error ? err.message : String(err)
    })
  },
  { flush: 'post' }
)

async function togglePreservingScroll(): Promise<void> {
  // Capture scroll percentage of the current view before the DOM swap.
  const fromEl = viewer.sourceMode ? sourceEl.value : proseEl.value
  const scrollPct = fromEl && fromEl.scrollHeight > 0 ? fromEl.scrollTop / fromEl.scrollHeight : 0

  await viewer.toggleSourceMode()

  // Wait for Vue to swap the element, then restore position.
  await nextTick()
  const toEl = viewer.sourceMode ? sourceEl.value : proseEl.value
  if (toEl && toEl.scrollHeight > 0) {
    toEl.scrollTop = scrollPct * toEl.scrollHeight
  }
}

function onToggleSourceMode(): void {
  void togglePreservingScroll()
}

function onRenderedClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('a')) return

  const taskLine = target?.closest<HTMLElement>('.markdown-task-line')
  const button =
    target?.closest<HTMLButtonElement>('.markdown-task-toggle') ??
    taskLine?.querySelector<HTMLButtonElement>('.markdown-task-toggle')
  if (!button || !proseEl.value?.contains(button)) return

  const line = Number(button.dataset.taskLine)
  const checkboxColumn = Number(button.dataset.taskCheckboxColumn)
  const isChecked = button.dataset.taskChecked === 'true'
  if (!Number.isInteger(line) || !Number.isInteger(checkboxColumn)) return

  event.preventDefault()
  button.disabled = true
  void viewer.toggleRenderedTask({ line, checkboxColumn, checked: !isChecked }).finally(() => {
    button.disabled = false
  })
}

function updateActiveOutline(): void {
  const scrollEl = proseEl.value
  if (!scrollEl) return

  const scrollTop = scrollEl.scrollTop
  let activeId = 'overview'

  for (const item of sectionOutline.value) {
    const heading = scrollEl.querySelector<HTMLElement>(`#${CSS.escape(item.id)}`)
    if (!heading) continue
    if (heading.offsetTop <= scrollTop + 32) {
      activeId = item.id
    }
  }

  activeOutlineId.value = activeId
}

function onRenderedScroll(): void {
  updateActiveOutline()
}

function scrollToOverview(): void {
  proseEl.value?.scrollTo({ top: 0, behavior: 'auto' })
  activeOutlineId.value = 'overview'
}

function scrollToHeading(id: string): void {
  const scrollEl = proseEl.value
  const heading = scrollEl?.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
  if (!scrollEl || !heading) return

  scrollEl.scrollTo({ top: Math.max(heading.offsetTop - 8, 0), behavior: 'auto' })
  activeOutlineId.value = id
}

function setOutlineCollapsed(collapsed: boolean): void {
  const sourcePath = outlineSourcePath.value
  if (!sourcePath) {
    fallbackOutlineCollapsed.value = collapsed
    return
  }

  void workspace.setOutlineCollapsed({ sourcePath, collapsed })
}

function toggleDocumentOutline(): void {
  setOutlineCollapsed(!isOutlineCollapsed.value)
}

function startOutlineResize(event: PointerEvent): void {
  if (isOutlineCollapsed.value) return

  event.preventDefault()
  const startX = event.clientX
  const startWidth = documentOutlineWidth.value
  let latestClientX = startX
  let resizeFrame: number | null = null
  dragOutlineWidth.value = startWidth

  const applyMove = (): void => {
    resizeFrame = null
    dragOutlineWidth.value = clampDocumentOutlineWidth(startWidth + latestClientX - startX)
  }

  const onMove = (moveEvent: PointerEvent): void => {
    latestClientX = moveEvent.clientX
    if (resizeFrame === null) {
      resizeFrame = window.requestAnimationFrame(applyMove)
    }
  }

  const onUp = (upEvent: PointerEvent): void => {
    const width = clampDocumentOutlineWidth(startWidth + upEvent.clientX - startX)
    _stopOutlineResize?.()
    dragOutlineWidth.value = null
    void workspace.setOutlineWidth({ width })
  }

  _stopOutlineResize = () => {
    if (resizeFrame !== null) {
      window.cancelAnimationFrame(resizeFrame)
      resizeFrame = null
    }
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    _stopOutlineResize = undefined
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp, { once: true })
}

// Diagrams are drawn for one color mode, so a change of mode draws them again.
const colorSchemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
function onColorSchemeChange(): void {
  const html = renderedHtml.value
  if (!html) return
  renderedHtml.value = ''
  void nextTick(() => {
    renderedHtml.value = html
  })
}

// A different font changes how diagrams are drawn too. They are measured as they are drawn, so wait
// until the font has loaded (applying it again is harmless) or the labels get the old font's size.
watch(
  () => settings.state?.fontFamily ?? DEFAULT_FONT_ID,
  async (id) => {
    await applyFont(id)
    onColorSchemeChange()
  }
)

onMounted(() => {
  colorSchemeQuery?.addEventListener('change', onColorSchemeChange)
  window.addEventListener('ryte:toggle-source-mode', onToggleSourceMode)
})

onUnmounted(() => {
  colorSchemeQuery?.removeEventListener('change', onColorSchemeChange)
  _stopOutlineResize?.()
  window.removeEventListener('ryte:toggle-source-mode', onToggleSourceMode)
})
</script>

<template>
  <section
    :id="WORKSPACE_TABPANEL_ID"
    class="viewer"
    :role="activeTabPanelLabelledBy ? 'tabpanel' : undefined"
    :aria-labelledby="activeTabPanelLabelledBy"
    :aria-label="activeTabPanelLabelledBy ? undefined : 'Markdown viewer'"
  >
    <div v-if="viewer.error" class="error">
      <p>
        Could not open <code>{{ filenameDisplay }}</code>
      </p>
      <p class="error-detail">{{ viewer.error }}</p>
    </div>
    <div v-else-if="renderError" class="error">
      <p>Render failed</p>
      <p class="error-detail">{{ renderError }}</p>
    </div>
    <p v-else-if="!viewer.displayPath" class="empty">Select a file to view</p>
    <p v-else-if="viewer.loading" class="empty">Loading…</p>
    <pre
      v-else-if="viewer.sourceMode"
      ref="sourceEl"
      class="source ryte-scrollbar ryte-scrollbar--y"
    ><code>{{ viewer.content }}</code></pre>
    <div v-else class="document-view">
      <aside
        v-if="hasDocumentOutline"
        class="document-outline ryte-scrollbar ryte-scrollbar--y"
        :class="{ 'document-outline--collapsed': isOutlineCollapsed }"
        :style="documentOutlineStyle"
        aria-label="Document sections"
      >
        <div
          v-if="!isOutlineCollapsed"
          class="document-outline-overview-row"
          :class="{ 'document-outline-item--active': activeOutlineId === 'overview' }"
        >
          <button
            type="button"
            class="document-outline-item document-outline-item--overview"
            :aria-current="activeOutlineId === 'overview' ? 'location' : undefined"
            @click="scrollToOverview"
          >
            <span
              class="document-outline-marker"
              :class="{ 'document-outline-marker--active': activeOutlineId === 'overview' }"
              aria-hidden="true"
            ></span>
            <span class="document-outline-title">Overview</span>
          </button>
          <StIconButton
            icon="sidebar"
            label="Hide document sections"
            aria-controls="document-outline-list"
            :aria-expanded="true"
            @click="toggleDocumentOutline"
          />
        </div>
        <StIconButton
          v-else
          class="document-outline-expand-button"
          icon="sidebar"
          label="Show document sections"
          aria-controls="document-outline-list"
          :aria-expanded="false"
          @click="toggleDocumentOutline"
        />
        <nav v-if="!isOutlineCollapsed" id="document-outline-list" class="document-outline-list">
          <button
            v-for="item in visibleSectionOutline"
            :key="item.id"
            type="button"
            class="document-outline-item"
            :class="[
              `document-outline-item--level-${item.level}`,
              { 'document-outline-item--active': activeOutlineId === item.id }
            ]"
            :aria-current="activeOutlineId === item.id ? 'location' : undefined"
            @click="scrollToHeading(item.id)"
          >
            <span
              class="document-outline-marker"
              :class="{ 'document-outline-marker--active': activeOutlineId === item.id }"
              aria-hidden="true"
            ></span>
            <span class="document-outline-title">{{ item.text }}</span>
          </button>
        </nav>
        <div
          v-if="!isOutlineCollapsed"
          class="document-outline-resize"
          role="separator"
          aria-label="Resize document sections"
          aria-orientation="vertical"
          @pointerdown="startOutlineResize"
        ></div>
      </aside>
      <StProse
        ref="proseRef"
        class="viewer-prose ryte-scrollbar ryte-scrollbar--y"
        :html="renderedHtml"
        @click="onRenderedClick"
        @scroll.passive="onRenderedScroll"
      />
    </div>
  </section>
</template>

<style scoped>
.viewer {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.document-view {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.document-outline {
  position: relative;
  flex: 0 0 auto;
  padding: var(--st-space-250) var(--st-space-150) var(--st-space-300);
  overflow: auto;
}

.document-outline--collapsed {
  padding-left: var(--st-space-100);
  padding-right: var(--st-space-100);
}

.document-outline-overview-row {
  width: 100%;
  min-height: var(--st-block-400);
  display: flex;
  align-items: center;
  border-radius: var(--st-space-75);
  background: transparent;
}

.document-outline-overview-row:hover,
.document-outline-overview-row:focus-within {
  background: var(--st-color-surface-hover);
}

.document-outline-overview-row.document-outline-item--active {
  background: var(--st-color-surface-hover);
}

.document-outline-item {
  width: 100%;
  min-height: var(--st-block-350);
  display: flex;
  align-items: center;
  gap: var(--st-space-100);
  padding: var(--st-space-50) var(--st-space-100);
  border: 0;
  border-radius: var(--st-space-75);
  background: transparent;
  color: var(--st-color-text-muted);
  font: inherit;
  font-size: var(--st-type-body-compact-size);
  line-height: var(--st-type-body-compact-leading);
  text-align: left;
  cursor: pointer;
}

.document-outline-overview-row .document-outline-item {
  flex: 1 1 auto;
  min-width: 0;
  border-radius: 0;
  background: transparent;
}

.document-outline-item:hover {
  background: var(--st-color-surface-hover);
  color: var(--st-color-text-primary);
}

.document-outline-item:focus-visible,
.document-outline-item--active {
  background: var(--st-color-surface-hover);
  color: var(--st-color-text-primary);
}

.document-outline-overview-row .document-outline-item:hover,
.document-outline-overview-row .document-outline-item:focus-visible,
.document-outline-overview-row .document-outline-item--active {
  background: transparent;
}

.document-outline-item:focus-visible,
.document-outline-list {
  display: flex;
  flex-direction: column;
  gap: var(--st-space-25);
  margin-top: var(--st-space-100);
}

.document-outline-expand-button {
  margin: 0 auto;
}

.document-outline-item--level-3 {
  padding-left: var(--st-space-250);
  font-size: var(--st-type-body-sm-size);
}

.document-outline-item--level-4 {
  padding-left: var(--st-space-450);
  font-size: var(--st-type-body-sm-size);
}

.document-outline-marker {
  width: var(--st-block-75);
  height: var(--st-block-75);
  flex: 0 0 auto;
  border-radius: var(--st-radius-pill);
  opacity: 0;
  background: currentColor;
}

.document-outline-marker--active {
  opacity: 1;
}

.document-outline-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-outline-resize {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
  width: var(--st-block-250);
  cursor: col-resize;
  touch-action: none;
}

.document-outline-resize::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: var(--st-block-25);
  background: transparent;
}

.document-outline-resize:hover::after {
  background: color-mix(in oklab, var(--st-color-accent) 80%, transparent);
}

.empty,
.error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--st-color-text-muted);
  padding: var(--st-space-400);
  text-align: center;
}

.error code {
  font-family: var(--st-font-ui-mono);
  color: var(--st-color-danger);
}

.error-detail {
  font-size: var(--st-type-code-md-size);
  font-family: var(--st-type-code-md-family);
  margin-top: var(--st-space-100);
  color: var(--st-color-danger);
  max-width: 50ch;
}

.source {
  flex: 1;
  margin: 0;
  padding: var(--st-space-300) var(--st-space-400);
  overflow: auto;
  font-family: var(--st-type-code-lg-family);
  font-size: var(--st-type-code-lg-size);
  line-height: var(--st-type-code-lg-leading);
  color: var(--st-color-text-primary);
  white-space: pre-wrap;
  word-wrap: break-word;
  background: transparent;
}

.viewer-prose {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: var(--st-space-400) var(--st-space-500) var(--st-space-800);
  max-width: var(--st-reading-measure);
}
</style>
