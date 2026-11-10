<script setup lang="ts">
/** The tab for a video file: the player fitted to the tab, with the file's name, length and size. It never plays by itself. */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { noteFileUrl } from '../../../shared/note-pictures'
import { useFileCatalogStore } from '../stores/file-catalog'
import { formatPictureFileSize } from './picture-tab-model'
import {
  buildVideoProblemNotice,
  formatVideoDuration,
  openVideoInDefaultApp,
  type VideoProblem
} from './video-problems'

const props = defineProps<{
  /** The video's path relative to the notes folder. */
  path: string
}>()

const catalog = useFileCatalogStore()

const name = computed(() => props.path.slice(props.path.lastIndexOf('/') + 1))
const src = computed(() => noteFileUrl(props.path))
const duration = ref<number | null>(null)
const problem = ref<VideoProblem | null>(null)
const problemHost = ref<HTMLElement | null>(null)

const sizeBytes = computed(
  () => catalog.files.find((file) => file.sourcePath === props.path)?.sizeBytes ?? null
)
const details = computed(() =>
  [
    duration.value === null ? null : formatVideoDuration(duration.value),
    sizeBytes.value === null ? null : formatPictureFileSize(sizeBytes.value)
  ]
    .filter(Boolean)
    .join(' · ')
)

function onLoadedMetadata(event: Event): void {
  const length = (event.target as HTMLVideoElement).duration
  duration.value = Number.isFinite(length) ? length : null
}

// A video that is missing, blocked or that the player can't play fails to load; the operation says which.
async function onError(): Promise<void> {
  const path = props.path
  let next: VideoProblem
  try {
    next = await window.ryte.video.explain({ path })
  } catch {
    next = { reason: 'unplayable', sizeBytes: null }
  }
  if (path === props.path) problem.value = next
}

watch(
  [problem, problemHost],
  ([next, host]) => {
    if (!host) return
    host.replaceChildren(...(next ? [buildVideoProblemNotice(document, next, props.path, '')] : []))
  },
  { flush: 'post' }
)

function onProblemClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : null
  const button = target?.closest<HTMLButtonElement>('[data-note-video-open]')
  if (!button?.dataset.noteVideoOpen) return
  event.preventDefault()
  void openVideoInDefaultApp(button, button.dataset.noteVideoOpen)
}

onMounted(() => {
  void catalog.hydrate()
})
onUnmounted(() => {
  catalog.unbind()
})
</script>

<template>
  <div class="video-tab">
    <header class="video-caption">
      <span class="video-name">{{ name }}</span>
      <span v-if="details" class="video-details">{{ details }}</span>
    </header>
    <div
      v-if="problem"
      ref="problemHost"
      class="st-prose video-problem"
      @click="onProblemClick"
    ></div>
    <div v-else class="video-stage">
      <video
        class="video-player"
        :src="src"
        :aria-label="name"
        controls
        preload="metadata"
        @loadedmetadata="onLoadedMetadata"
        @error="onError"
      ></video>
    </div>
  </div>
</template>

<style scoped>
.video-tab {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--st-space-150);
  padding: var(--st-space-300) var(--st-space-400);
}

.video-caption {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--st-space-100) var(--st-space-200);
}

.video-name {
  font: var(--st-type-label-md);
  color: var(--st-color-text-primary);
  overflow-wrap: anywhere;
}

.video-details {
  font-size: var(--st-type-body-sm-size);
  line-height: var(--st-type-body-sm-leading);
  color: var(--st-color-text-muted);
}

.video-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-player {
  display: block;
  max-width: 100%;
  max-height: 100%;
  border-radius: var(--st-space-50);
}

.video-problem {
  flex: 1;
  min-height: 0;
}
</style>
