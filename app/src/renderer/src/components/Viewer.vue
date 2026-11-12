<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { DEFAULT_FONT_ID } from '../../../shared/fonts'
import { parseLocalAddress } from '../../../shared/local-address'
import { applyFont } from '../fonts/load-fonts'
import { renderMermaidDiagrams } from '../markdown/mermaid'
import {
  renderDocument,
  type MarkdownOutlineItem,
  type RenderedMarkdownDocument
} from '../markdown/renderer'
import { useLocalAddressStore } from '../stores/local-address'
import { useSettingsStore } from '../stores/settings'
import { useViewerStore } from '../stores/viewer'
import { useWorkspaceStore } from '../stores/workspace'
import { clampDocumentOutlineWidth } from '../../../shared/workspace'
import StIconButton from '../stencil/components/StIconButton.vue'
import StProse from '../stencil/components/StProse.vue'
import StSegmented from '../stencil/components/StSegmented.vue'
import NoteLightbox from './NoteLightbox.vue'
import { buildLightboxList, type LightboxPicture, type PagePicture } from './lightbox-model'
import { rememberedTabScroll, rememberTabScroll } from './tab-scroll'
import CodeViewer from './CodeViewer.vue'
import { currentSectionId, sectionOutlineOf } from './document-outline-model'
import PageViewer from './PageViewer.vue'
import PictureViewer from './PictureViewer.vue'
import VideoViewer from './VideoViewer.vue'
import { buildVideoProblemNotice, noteVideoPathOf, openVideoInDefaultApp } from './video-problems'
import {
  buildPictureProblemNotice,
  notePicturePathOf,
  openPictureInDefaultApp
} from './note-picture-problems'
import { WORKSPACE_TABPANEL_ID, getWorkspaceTabDomId } from './workspace-tab-keyboard'

const viewer = useViewerStore()
const localAddress = useLocalAddressStore()
const settings = useSettingsStore()
const workspace = useWorkspaceStore()
const renderedHtml = ref<string>('')
const documentOutline = ref<MarkdownOutlineItem[]>([])
const renderError = ref<string | null>(null)
const renderCache = new Map<string, RenderedMarkdownDocument>()
const proseRef = ref<InstanceType<typeof StProse> | null>(null)
const proseEl = computed<HTMLElement | null>(() => (proseRef.value?.$el as HTMLElement) ?? null)
const sourceEl = ref<HTMLElement | null>(null)
// The note whose rendered text is in the view now. The text of the tab just switched to arrives a moment later.
const renderedFor = ref<string | null>(null)

// A note tab keeps where it was scrolled to while the app runs. The position is saved as the tab is left, while
// the old text is still on screen, and put back once the text of the tab that returns has been drawn.
const scrollKeyOf = (path: string, source: boolean): string =>
  `note:${path}:${source ? 'source' : 'preview'}`
let displayedKey: string | null = null
let restoreKey: string | null = null
const scrollerOf = (key: string): HTMLElement | null =>
  key.endsWith(':source') ? sourceEl.value : proseEl.value

watch(
  [() => viewer.sourcePath, () => viewer.sourceMode] as const,
  ([path, source], [previousPath]) => {
    if (displayedKey) {
      const el = scrollerOf(displayedKey)
      if (el) rememberTabScroll(displayedKey, el.scrollTop)
    }
    displayedKey = null
    // Switching between Preview and Code keeps its own proportional position (see togglePreservingScroll).
    restoreKey = path && path !== previousPath ? scrollKeyOf(path, source) : null
  },
  { flush: 'sync' }
)

function settleScroll(): void {
  const path = viewer.sourcePath
  if (!path || viewer.loading || viewer.error) return
  if (!viewer.sourceMode && renderedFor.value !== path) return
  const key = scrollKeyOf(path, viewer.sourceMode)
  const el = scrollerOf(key)
  if (!el) return
  displayedKey = key
  if (restoreKey !== key) return
  restoreKey = null
  const top = rememberedTabScroll(key)
  if (top > 0) el.scrollTop = top
}
const fallbackOutlineCollapsed = ref(false)
const dragOutlineWidth = ref<number | null>(null)
const activeOutlineId = ref('')
const lightbox = ref<{ pictures: LightboxPicture[]; start: number } | null>(null)

let _stopOutlineResize: (() => void) | undefined

const NOTE_VIEWS = [
  { value: 'preview', label: 'Preview', icon: 'eye' },
  { value: 'source', label: 'Code', icon: 'brackets' }
] as const

// A note has both a rendered view and its text. A picture, a video, a page, a local address and a code
// file have no source to switch to.
const isNote = computed(
  () =>
    !!viewer.displayPath &&
    !viewer.error &&
    !viewer.picturePath &&
    !viewer.videoPath &&
    !viewer.pagePath &&
    !viewer.addressUrl &&
    !viewer.codePath
)

const filenameDisplay = computed(() => {
  return viewer.displayPath ?? ''
})
const activeTabPanelLabelledBy = computed(() =>
  workspace.activeTabId ? getWorkspaceTabDomId(workspace.activeTabId) : undefined
)
// The header bar shows for every note, in Preview and in Code.
const showNoteBar = computed(() => isNote.value && !viewer.loading && !renderError.value)
const sectionOutline = computed(() => sectionOutlineOf(documentOutline.value))
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
const activeSectionId = computed(() => outlineParentById.value.get(activeOutlineId.value) ?? null)
const visibleSectionOutline = computed(() =>
  sectionOutline.value.filter((item) => {
    if (item.level === 2) return true
    return outlineParentById.value.get(item.id) === activeSectionId.value
  })
)
// A note with section headings has an outline to show or hide; one without has no toggle.
const hasOutlineHeadings = computed(() => sectionOutline.value.length > 0)
const outlineSourcePath = computed(() => viewer.sourcePath)
const isOutlineCollapsed = computed(() => {
  const sourcePath = outlineSourcePath.value
  if (!sourcePath) return fallbackOutlineCollapsed.value
  return workspace.outlineCollapsedByPath[sourcePath] === true
})
const documentOutlineWidth = computed(
  () => dragOutlineWidth.value ?? clampDocumentOutlineWidth(workspace.outlineWidth)
)
const hasDocumentOutline = computed(
  () =>
    !viewer.sourceMode &&
    !viewer.loading &&
    !viewer.error &&
    hasOutlineHeadings.value &&
    !isOutlineCollapsed.value
)
const documentOutlineStyle = computed(() => ({
  width: `${documentOutlineWidth.value}px`,
  flexBasis: `${documentOutlineWidth.value}px`
}))

async function updateRender(text: string): Promise<void> {
  // Pictures resolve against the note's folder, so the same text renders differently per note.
  const notePath = viewer.sourcePath ?? undefined
  const cacheKey = `${notePath ?? ''}\0${text}`
  if (renderCache.has(cacheKey)) {
    const cached = renderCache.get(cacheKey)!
    renderedHtml.value = cached.html
    documentOutline.value = cached.outline
    renderedFor.value = notePath ?? null
    return
  }
  const document = await renderDocument(text, { interactiveTasks: true, breaks: true, notePath })
  renderCache.set(cacheKey, document)
  // Bound cache to avoid unbounded growth on many file edits in one session.
  if (renderCache.size > 50) {
    const firstKey = renderCache.keys().next().value
    if (firstKey) renderCache.delete(firstKey)
  }
  // Only commit the result if the content hasn't changed in the meantime
  // (user may have switched files while we were rendering).
  if (text === viewer.content && notePath === (viewer.sourcePath ?? undefined)) {
    renderedHtml.value = document.html
    documentOutline.value = document.outline
    renderedFor.value = notePath ?? null
  }
}

async function hydrateRenderedContent(): Promise<void> {
  await nextTick()
  if (viewer.sourceMode || !proseEl.value) return
  await renderMermaidDiagrams(proseEl.value)
  updateActiveOutline()
}

watch(
  [() => viewer.content, () => viewer.sourcePath],
  ([next]) => {
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
    lightbox.value = null
    hydrateRenderedContent()
      .catch((err) => {
        renderError.value = err instanceof Error ? err.message : String(err)
      })
      .finally(settleScroll)
  },
  { flush: 'post' }
)

// Also when the text of a tab has loaded without changing what is drawn (the same words under another name).
watch([renderedFor, () => viewer.loading], settleScroll, { flush: 'post' })

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
  if (!isNote.value) return
  void togglePreservingScroll()
}

function onNoteViewChange(value: string): void {
  if ((value === 'source') !== viewer.sourceMode) onToggleSourceMode()
}

async function explainFailedPicture(img: HTMLImageElement): Promise<void> {
  const path = notePicturePathOf(img)
  if (path === null || img.dataset.notePictureFailed) return
  img.dataset.notePictureFailed = 'true'
  const problem = await window.ryte.pictures.explain({ path })
  if (!img.isConnected) return
  const host = img.closest('.note-picture-button') ?? img
  host.replaceWith(buildPictureProblemNotice(document, problem, path, img.alt))
}

async function explainFailedVideo(video: HTMLVideoElement): Promise<void> {
  const path = noteVideoPathOf(video)
  if (path === null || video.dataset.noteVideoFailed) return
  video.dataset.noteVideoFailed = 'true'
  const problem = await window.ryte.video.explain({ path })
  if (!video.isConnected) return
  const host = video.closest('.note-video') ?? video
  const alt = host.getAttribute('aria-label') ?? ''
  host.replaceWith(buildVideoProblemNotice(document, problem, path, alt))
}

// `error` does not bubble, so the prose listens for it in the capture phase.
function onRenderedError(event: Event): void {
  if (event.target instanceof HTMLImageElement) {
    explainFailedPicture(event.target).catch(() => {
      // The picture keeps its broken state; nothing about the file is shown.
    })
  } else if (event.target instanceof HTMLVideoElement) {
    explainFailedVideo(event.target).catch(() => {
      // The video keeps its broken state; nothing about the file is shown.
    })
  }
}

function pagePictures(): PagePicture[] {
  const buttons = proseEl.value?.querySelectorAll<HTMLButtonElement>('.note-picture-button') ?? []
  return [...buttons].flatMap((button) => {
    const img = button.querySelector('img')
    const index = Number(button.dataset.notePictureIndex)
    if (!img || !Number.isInteger(index)) return []
    return [
      {
        index,
        src: img.src,
        alt: img.alt,
        origin: notePicturePathOf(img) ?? '',
        // A lazy picture still waiting to load counts; one that finished with no size failed.
        loaded: !(img.complete && img.naturalWidth === 0)
      }
    ]
  })
}

function openLightbox(clickedIndex: number): void {
  if (!Number.isInteger(clickedIndex)) return
  lightbox.value = buildLightboxList(pagePictures(), clickedIndex)
}

function onRenderedClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : null
  const openButton = target?.closest<HTMLButtonElement>('[data-note-picture-open]')
  if (openButton?.dataset.notePictureOpen && proseEl.value?.contains(openButton)) {
    event.preventDefault()
    void openPictureInDefaultApp(openButton, openButton.dataset.notePictureOpen)
    return
  }
  const openVideoButton = target?.closest<HTMLButtonElement>('[data-note-video-open]')
  if (openVideoButton?.dataset.noteVideoOpen && proseEl.value?.contains(openVideoButton)) {
    event.preventDefault()
    void openVideoInDefaultApp(openVideoButton, openVideoButton.dataset.noteVideoOpen)
    return
  }
  const link = target?.closest('a')
  if (link) {
    // A link to a page on this Mac opens in its own tab, after the prompt unless it is always allowed. Only a
    // click on the app's own rendered note comes here; every other link behaves as before.
    const href = link.getAttribute('href')
    if (href && parseLocalAddress(href) && proseEl.value?.contains(link)) {
      event.preventDefault()
      void localAddress.ask(href)
    }
    return
  }

  const pictureButton = target?.closest<HTMLButtonElement>('.note-picture-button')
  if (pictureButton && proseEl.value?.contains(pictureButton)) {
    event.preventDefault()
    openLightbox(Number(pictureButton.dataset.notePictureIndex))
    return
  }

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

// Text starts below the header bar, so the scroll area's top padding is where the first line sits at rest.
const ACTIVE_SECTION_SLACK_PX = 24

function contentStartOf(scrollEl: HTMLElement): number {
  return Number.parseFloat(getComputedStyle(scrollEl).paddingTop) || 0
}

function headingTopOf(scrollEl: HTMLElement, id: string): number | null {
  const heading = scrollEl.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
  if (!heading) return null
  return (
    heading.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop
  )
}

function updateActiveOutline(): void {
  const scrollEl = proseEl.value
  if (!scrollEl) return

  const line = scrollEl.scrollTop + contentStartOf(scrollEl) + ACTIVE_SECTION_SLACK_PX
  activeOutlineId.value = currentSectionId(
    sectionOutline.value,
    (id) => headingTopOf(scrollEl, id),
    line
  )
}

function onRenderedScroll(): void {
  updateActiveOutline()
}

function scrollToHeading(id: string): void {
  const scrollEl = proseEl.value
  const top = scrollEl ? headingTopOf(scrollEl, id) : null
  if (!scrollEl || top === null) return

  // The heading lands where the first line sits at rest, just below the header bar.
  scrollEl.scrollTo({ top: Math.max(top - contentStartOf(scrollEl), 0), behavior: 'auto' })
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
    <div v-if="showNoteBar" class="note-bar">
      <div class="note-bar-row">
        <StIconButton
          v-if="hasOutlineHeadings"
          class="note-bar-control"
          icon="sidebar"
          size="sm"
          :label="isOutlineCollapsed ? 'Show document sections' : 'Hide document sections'"
          aria-controls="document-outline-list"
          :aria-expanded="!isOutlineCollapsed"
          @click="toggleDocumentOutline"
        />
        <span class="note-bar-path" :title="filenameDisplay">{{ filenameDisplay }}</span>
        <StSegmented
          class="note-bar-control"
          :model-value="viewer.sourceMode ? 'source' : 'preview'"
          :options="NOTE_VIEWS"
          label="Note view"
          size="sm"
          @update:model-value="onNoteViewChange"
        />
      </div>
    </div>
    <PictureViewer v-if="viewer.picturePath" :key="viewer.picturePath" :path="viewer.picturePath" />
    <VideoViewer v-else-if="viewer.videoPath" :key="viewer.videoPath" :path="viewer.videoPath" />
    <PageViewer v-else-if="viewer.pagePath" :key="viewer.pagePath" :path="viewer.pagePath" />
    <PageViewer v-else-if="viewer.addressUrl" :key="viewer.addressUrl" :url="viewer.addressUrl" />
    <CodeViewer v-else-if="viewer.codePath" :key="viewer.codePath" :path="viewer.codePath" />
    <div v-else-if="viewer.error" class="error">
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
    <div v-else class="document-view" :class="{ 'document-view--no-outline': !hasDocumentOutline }">
      <aside
        v-if="hasDocumentOutline"
        class="document-outline ryte-scrollbar ryte-scrollbar--y"
        :style="documentOutlineStyle"
        aria-label="Document sections"
      >
        <nav id="document-outline-list" class="document-outline-list">
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
        @error.capture="onRenderedError"
        @scroll.passive="onRenderedScroll"
      />
    </div>
    <NoteLightbox
      v-if="lightbox"
      :pictures="lightbox.pictures"
      :start="lightbox.start"
      @close="lightbox = null"
    />
  </section>
</template>

<style scoped>
.viewer {
  /* The header bar floats over the top of the note: 16px in from the edges, then a 16px gap before the text. */
  --note-bar-inset: var(--st-space-200);
  --note-bar-height: calc(var(--st-block-400) + var(--st-space-50) * 2);
  --note-content-start: calc(var(--note-bar-inset) + var(--note-bar-height) + var(--st-space-200));
  position: relative;
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* The bar has no background of its own. Text scrolls under it and fades out (see .note-scroll-fade). */
.note-bar {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  z-index: 4;
  height: calc(var(--note-bar-inset) + var(--note-bar-height));
  pointer-events: none;
}

/* Each note scroller fades its own content to nothing under the bar: invisible behind the controls,
   then fully visible by the line where text starts at rest, so nothing moves before scrolling. */
.document-outline,
.source,
.viewer-prose {
  mask-image: linear-gradient(
    to bottom,
    transparent calc(var(--note-bar-inset) + var(--note-bar-height) - var(--st-space-100)),
    var(--st-color-surface-base) var(--note-content-start)
  );
}

.note-bar-row {
  position: absolute;
  top: var(--note-bar-inset);
  right: var(--note-bar-inset);
  left: var(--note-bar-inset);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--st-space-100);
  min-height: var(--note-bar-height);
  padding: var(--st-space-50);
  border-radius: var(--st-space-100);
}

.note-bar-control {
  flex: 0 0 auto;
  pointer-events: auto;
}

.note-bar-path {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--st-color-text-tertiary);
  font-size: var(--st-font-size-100);
  line-height: var(--st-line-height-300);
  text-overflow: ellipsis;
  white-space: nowrap;
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
  padding: var(--note-content-start) var(--st-space-150) var(--st-space-300) var(--st-space-200);
  overflow: auto;
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

.document-outline-item:hover {
  background: var(--st-color-surface-hover);
  color: var(--st-color-text-primary);
}

.document-outline-item:focus-visible,
.document-outline-item--active {
  background: var(--st-color-surface-hover);
  color: var(--st-color-text-primary);
}

.document-outline-list {
  display: flex;
  flex-direction: column;
  gap: var(--st-space-25);
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
  padding: var(--note-content-start) var(--st-space-400) var(--st-space-300);
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
  padding: var(--note-content-start) var(--st-space-500) var(--st-space-800) var(--st-space-300);
  max-width: var(--st-reading-measure);
}

.document-view--no-outline .viewer-prose {
  padding-left: var(--st-space-500);
}
</style>
