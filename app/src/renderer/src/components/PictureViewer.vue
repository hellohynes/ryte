<script setup lang="ts">
/** The tab for a picture file: the picture fitted to the tab with its name, pixel size and file size. A click opens the folder's pictures in the lightbox. */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { noteFileUrl } from '../../../shared/note-pictures'
import { useFileCatalogStore } from '../stores/file-catalog'
import { useViewerStore } from '../stores/viewer'
import { useWorkspaceStore } from '../stores/workspace'
import NoteLightbox from './NoteLightbox.vue'
import type { LightboxPicture } from './lightbox-model'
import {
  buildPictureProblemNotice,
  openPictureInDefaultApp,
  type PictureProblem
} from './note-picture-problems'
import { folderPictureList, formatPictureFileSize, lightboxPicturesFor } from './picture-tab-model'
import { buildSidebarTree, modifiedAtMsBySourcePath } from './sidebar-tree-model'

const props = defineProps<{
  /** The picture's path relative to the notes folder. */
  path: string
}>()

const viewer = useViewerStore()
const workspace = useWorkspaceStore()
const catalog = useFileCatalogStore()

const name = computed(() => props.path.slice(props.path.lastIndexOf('/') + 1))
const src = computed(() => noteFileUrl(props.path))
const pixels = ref<{ width: number; height: number } | null>(null)
const problem = ref<PictureProblem | null>(null)
const problemHost = ref<HTMLElement | null>(null)
const lightbox = ref<{ pictures: LightboxPicture[]; start: number } | null>(null)

const sizeBytes = computed(
  () => catalog.files.find((file) => file.sourcePath === props.path)?.sizeBytes ?? null
)
const details = computed(() =>
  [
    pixels.value ? `${pixels.value.width} × ${pixels.value.height} px` : null,
    sizeBytes.value === null ? null : formatPictureFileSize(sizeBytes.value)
  ]
    .filter(Boolean)
    .join(' · ')
)

function onLoad(event: Event): void {
  const img = event.target as HTMLImageElement
  pixels.value = { width: img.naturalWidth, height: img.naturalHeight }
}

// A picture over the 50 MB cap, missing or blocked fails to load; the existing operation says which.
async function onError(): Promise<void> {
  const path = props.path
  let next: PictureProblem
  try {
    next = await window.ryte.pictures.explain({ path })
  } catch {
    next = { reason: 'unreadable', sizeBytes: null }
  }
  if (path === props.path) problem.value = next
}

watch(
  [problem, problemHost],
  ([next, host]) => {
    if (!host) return
    host.replaceChildren(
      ...(next ? [buildPictureProblemNotice(document, next, props.path, '')] : [])
    )
  },
  { flush: 'post' }
)

function onProblemClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : null
  const button = target?.closest<HTMLButtonElement>('[data-note-picture-open]')
  if (!button?.dataset.notePictureOpen) return
  event.preventDefault()
  void openPictureInDefaultApp(button, button.dataset.notePictureOpen)
}

function openLightbox(): void {
  const tree = buildSidebarTree(
    viewer.tree,
    workspace.library.folderSortModes,
    modifiedAtMsBySourcePath(catalog.files)
  )
  const list = folderPictureList(tree, props.path) ?? { paths: [props.path], start: 0 }
  lightbox.value = { pictures: lightboxPicturesFor(list.paths), start: list.start }
}

onMounted(() => {
  void catalog.hydrate()
})
onUnmounted(() => {
  catalog.unbind()
})
</script>

<template>
  <div class="picture-tab">
    <header class="picture-caption">
      <span class="picture-name">{{ name }}</span>
      <span v-if="details" class="picture-details">{{ details }}</span>
    </header>
    <div
      v-if="problem"
      ref="problemHost"
      class="st-prose picture-problem"
      @click="onProblemClick"
    ></div>
    <button
      v-else
      type="button"
      class="picture-stage"
      :aria-label="`Open picture: ${name}`"
      @click="openLightbox"
    >
      <img class="picture-image" :src="src" :alt="name" @load="onLoad" @error="onError" />
    </button>
    <NoteLightbox
      v-if="lightbox"
      :pictures="lightbox.pictures"
      :start="lightbox.start"
      @close="lightbox = null"
    />
  </div>
</template>

<style scoped>
.picture-tab {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--st-space-150);
  padding: var(--st-space-300) var(--st-space-400);
}

.picture-caption {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--st-space-100) var(--st-space-200);
}

.picture-name {
  font: var(--st-type-label-md);
  color: var(--st-color-text-primary);
  overflow-wrap: anywhere;
}

.picture-details {
  font-size: var(--st-type-body-sm-size);
  line-height: var(--st-type-body-sm-leading);
  color: var(--st-color-text-muted);
}

.picture-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--st-space-75);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: zoom-in;
}

.picture-stage:focus-visible {
  outline: var(--st-border-200) solid var(--st-color-focus);
  outline-offset: var(--st-space-25);
}

.picture-image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--st-space-50);
}

.picture-problem {
  flex: 1;
  min-height: 0;
}
</style>
