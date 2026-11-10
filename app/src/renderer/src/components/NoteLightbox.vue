<script setup lang="ts">
/** Shows a list of pictures large, one at a time, with previous and next. Closing returns focus to the opener. */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import StDialog from '../stencil/components/StDialog.vue'
import StIconButton from '../stencil/components/StIconButton.vue'
import { stepLightbox, type LightboxPicture } from './lightbox-model'

const props = defineProps<{
  pictures: LightboxPicture[]
  /** The position of the picture to show first. */
  start: number
}>()
const emit = defineEmits<{ close: [] }>()

const index = ref(props.start)
watch(
  () => props.start,
  (start) => {
    index.value = start
  }
)

const current = computed(() => props.pictures[index.value])
const atFirst = computed(() => index.value <= 0)
const atLast = computed(() => index.value >= props.pictures.length - 1)

function step(direction: -1 | 1): void {
  index.value = stepLightbox(index.value, props.pictures.length, direction)
}

// Pictures that failed to load here (a lazy one that was missing or over the cap), so they show their
// description instead of a broken-picture icon.
const failed = reactive(new Set<string>())

// Listened for on the document, not the panel: a click on the picture or the text can move focus off the
// panel, and the arrows must keep working.
function onKeydown(event: KeyboardEvent): void {
  if (event.altKey || event.ctrlKey || event.metaKey) return
  const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : null
  if (direction === null) return
  event.preventDefault()
  step(direction)
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <StDialog label="Picture viewer" class="note-lightbox" @dismiss="emit('close')">
    <div v-if="current" class="note-lightbox-panel">
      <div class="note-lightbox-top">
        <span class="note-lightbox-position" aria-live="polite"
          >{{ index + 1 }} of {{ pictures.length }}</span
        >
        <StIconButton
          icon="close"
          label="Close"
          class="note-lightbox-close"
          @click="emit('close')"
        />
      </div>
      <div class="note-lightbox-stage">
        <StIconButton
          icon="chevron-left"
          label="Previous picture"
          class="note-lightbox-step"
          :aria-disabled="atFirst"
          @click="step(-1)"
        />
        <p v-if="failed.has(current.src)" class="note-lightbox-failed">
          Couldn't show this picture.
        </p>
        <img
          v-else
          :key="current.src"
          class="note-lightbox-picture"
          :src="current.src"
          :alt="current.alt"
          @error="failed.add(current.src)"
        />
        <StIconButton
          icon="chevron-right"
          label="Next picture"
          class="note-lightbox-step"
          :aria-disabled="atLast"
          @click="step(1)"
        />
      </div>
      <p v-if="current.alt" class="note-lightbox-description">{{ current.alt }}</p>
    </div>
  </StDialog>
</template>

<style scoped>
.note-lightbox-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--st-space-150);
  max-width: 100%;
  max-height: 100%;
  min-height: 0;
  padding: var(--st-space-150) var(--st-space-150) var(--st-space-200);
  border-radius: var(--st-space-150);
  background: var(--st-color-surface-floating);
  box-shadow: var(--st-shadow-xl);
}

.note-lightbox-top {
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--st-space-200);
}

.note-lightbox-position {
  padding-left: var(--st-space-100);
  font: var(--st-type-label-md);
  color: var(--st-color-text-secondary);
}

.note-lightbox-stage {
  display: flex;
  align-items: center;
  gap: var(--st-space-150);
  min-height: 0;
  max-width: 100%;
}

.note-lightbox-picture {
  display: block;
  min-width: 0;
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
  border-radius: var(--st-space-75);
}

.note-lightbox-failed {
  margin: 0;
  padding: var(--st-space-400) var(--st-space-300);
  font-size: var(--st-type-body-sm-size);
  line-height: var(--st-type-body-sm-leading);
  color: var(--st-color-text-secondary);
}

.note-lightbox-step[aria-disabled='true'] {
  opacity: 0.35;
  cursor: default;
}

.note-lightbox-description {
  margin: 0;
  max-width: 60ch;
  text-align: center;
  font-size: var(--st-type-body-sm-size);
  line-height: var(--st-type-body-sm-leading);
  color: var(--st-color-text-primary);
}

@media (prefers-reduced-motion: no-preference) {
  .note-lightbox-picture {
    animation: note-lightbox-in 140ms ease-out;
  }
}

@keyframes note-lightbox-in {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
}
</style>
