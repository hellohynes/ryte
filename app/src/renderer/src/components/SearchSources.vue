<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

import { sourceFileName, sourceFolder } from './search-result-model'
import type { CitedSource } from './cited-sources'

const props = defineProps<{
  sources: CitedSource[]
  /** Source number highlighted by hover or focus elsewhere. */
  linkedIndex: number | null
  /** The summary is still being written, so more sources may appear. */
  pending: boolean
  /** New rows show a skeleton before their name fades in; off for a saved summary. */
  animate: boolean
}>()

const emit = defineEmits<{ open: [sourcePath: string]; activate: [index: number | null] }>()

const SKELETON_MS = 520

// Numbers whose row has finished its skeleton and shows the real name.
const ready = ref(new Set<number>())
const timers = new Set<number>()

watch(
  () => props.sources.map((source) => source.number),
  (numbers) => {
    for (const number of numbers) {
      if (ready.value.has(number)) continue
      if (!props.animate) {
        ready.value = new Set([...ready.value, number])
        continue
      }
      const timer = window.setTimeout(() => {
        timers.delete(timer)
        ready.value = new Set([...ready.value, number])
      }, SKELETON_MS)
      timers.add(timer)
    }
    // A new run starts numbering from 1 again.
    if (numbers.length === 0) ready.value = new Set()
  },
  { immediate: true }
)

onBeforeUnmount(() => timers.forEach((timer) => window.clearTimeout(timer)))

function describe(source: CitedSource): string {
  return source.headingPaths
    .map((heading) => [source.sourcePath, ...heading].join(' › '))
    .filter((value, index, all) => all.indexOf(value) === index)
    .join('\n')
}
</script>

<template>
  <section class="sources" aria-labelledby="search-sources-heading">
    <h2 id="search-sources-heading" class="sources-heading">Cited sources</h2>

    <TransitionGroup v-if="sources.length > 0" name="source" tag="ul" class="sources-list">
      <li v-for="source in sources" :key="source.number" class="source-item">
        <button
          type="button"
          class="source-row"
          :class="{ linked: linkedIndex === source.number, loading: !ready.has(source.number) }"
          :data-source-index="source.number"
          :title="describe(source)"
          :inert="!ready.has(source.number)"
          @click="emit('open', source.sourcePath)"
          @mouseenter="emit('activate', source.number)"
          @mouseleave="emit('activate', null)"
          @focus="emit('activate', source.number)"
          @blur="emit('activate', null)"
        >
          <span class="source-index"><span class="sr-only">Source </span>{{ source.number }}</span>
          <span class="source-text">
            <span class="source-name">{{ sourceFileName(source.sourcePath) }}</span>
            <span v-if="sourceFolder(source.sourcePath)" class="source-folder">
              {{ sourceFolder(source.sourcePath) }}
            </span>
          </span>
        </button>
        <span class="skeleton" :class="{ gone: ready.has(source.number) }" aria-hidden="true">
          <span class="skeleton-index" aria-hidden="true"><span class="skeleton-bar" /></span>
          <span class="skeleton-text">
            <span class="skeleton-line"><span class="skeleton-bar skeleton-bar--name" /></span>
            <span class="skeleton-line skeleton-line--folder">
              <span class="skeleton-bar skeleton-bar--folder" />
            </span>
          </span>
        </span>
      </li>
    </TransitionGroup>

    <ul v-else-if="pending" class="sources-list" aria-hidden="true">
      <li v-for="n in 2" :key="n" class="source-item">
        <span class="skeleton skeleton--static">
          <span class="skeleton-index" aria-hidden="true"><span class="skeleton-bar" /></span>
          <span class="skeleton-text">
            <span class="skeleton-line"><span class="skeleton-bar skeleton-bar--name" /></span>
            <span class="skeleton-line skeleton-line--folder">
              <span class="skeleton-bar skeleton-bar--folder" />
            </span>
          </span>
        </span>
      </li>
    </ul>
    <p v-if="sources.length === 0 && pending" class="sr-only" role="status">
      Sources appear as the summary cites them.
    </p>
  </section>
</template>

<style scoped>
.sources {
  display: flex;
  flex-direction: column;
  gap: var(--st-space-100);
  padding: 0 var(--st-space-100);
}

.sources-heading {
  color: var(--sp-text);
  font-size: var(--st-type-label-lg-size);
  font-weight: var(--st-type-label-lg-weight);
  line-height: var(--st-type-label-lg-leading);
}

.sources-list {
  display: flex;
  flex-direction: column;
  gap: var(--st-space-25);
  margin: 0 var(--st-space-100-negative);
  padding: 0;
}

.source-item {
  position: relative;
  min-height: var(--st-block-550);
}

.source-row {
  display: flex;
  align-items: flex-start;
  gap: var(--st-space-50);
  width: 100%;
  padding: var(--st-space-25) var(--st-space-100);
  color: var(--sp-text-2);
  background: transparent;
  border: 0;
  border-radius: var(--st-space-75);
  cursor: pointer;
  font: inherit;
  line-height: var(--st-line-height-400);
  text-align: left;
  transition: opacity 360ms ease-out;
}

.source-row.loading {
  opacity: 0;
}

.source-row:hover,
.source-row.linked {
  background: var(--sp-link-wash);
}

.source-row:focus-visible {
  outline: var(--st-border-200) solid var(--sp-focus);
  outline-offset: var(--st-space-25-negative);
}

.source-row:hover .source-index,
.source-row.linked .source-index {
  color: var(--sp-link-strong);
}

.source-index {
  flex: 0 0 var(--st-block-200);
  color: var(--sp-link);
  font-size: var(--st-type-body-sm-size);
}

.source-text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  font-family: var(--sp-mono);
}

.source-name {
  font-size: var(--st-type-body-sm-size);
  overflow-wrap: anywhere;
}

.source-folder {
  color: var(--sp-text-3);
  font-size: var(--st-type-caption-sm-size);
  overflow-wrap: anywhere;
}

/* A placeholder has the anatomy of a real row (number, name line, folder line) so the row fades
   in over it without anything moving. Line heights match the real text. */
.skeleton {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  gap: var(--st-space-50);
  padding: var(--st-space-25) var(--st-space-100);
  pointer-events: none;
  transition: opacity 360ms ease-out;
}

.skeleton--static {
  position: static;
}

.skeleton.gone {
  opacity: 0;
}

.skeleton-index {
  display: flex;
  flex: 0 0 var(--st-block-200);
  align-items: center;
  height: var(--st-block-250);
}

.skeleton-index .skeleton-bar {
  width: var(--st-block-100);
  height: var(--st-block-125);
}

.skeleton-text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.skeleton-line {
  display: flex;
  align-items: center;
  height: var(--st-block-250);
}

.skeleton-line--folder {
  height: var(--st-block-200);
}

.skeleton-bar {
  display: block;
  height: var(--st-block-125);
  border-radius: var(--st-space-50);
  background: linear-gradient(
      90deg,
      var(--sp-hover) 0%,
      var(--st-color-surface-hover) 50%,
      var(--sp-hover) 100%
    )
    0 0 / 250% 100%;
  animation: skeleton-sweep 1.4s ease-in-out infinite;
}

.skeleton-bar--name {
  width: 78%;
}

.skeleton-bar--folder {
  width: 48%;
  height: var(--st-block-100);
}

.source-item:nth-child(even) .skeleton-bar--name {
  width: 58%;
}

.source-item:nth-child(even) .skeleton-bar--folder {
  width: 38%;
}

.source-enter-active {
  transition:
    opacity 300ms ease-out,
    transform 300ms cubic-bezier(0.22, 1, 0.36, 1);
}

.source-enter-from {
  opacity: 0;
  transform: translateY(var(--st-space-50));
}

.sr-only {
  position: absolute;
  width: var(--st-block-1);
  height: var(--st-block-1);
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@keyframes skeleton-sweep {
  from {
    background-position: 100% 0;
  }

  to {
    background-position: -100% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-bar {
    animation: none;
  }

  .source-row,
  .skeleton,
  .source-enter-active {
    transition: none;
  }
}
</style>
