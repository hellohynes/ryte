<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import type { RenderedAnswer, RenderedSection } from '../composables/useRenderedAnswer'
import StDisclosure from '../stencil/components/StDisclosure.vue'
import { sectionOpen } from './section-open-state'
import SearchTimeline from './SearchTimeline.vue'

const props = defineProps<{
  answer: RenderedAnswer
  /** Citation index highlighted by hover or focus elsewhere (a source row or a marker). */
  linkedIndex: number | null
  busy: boolean
}>()

const emit = defineEmits<{ open: [index: number]; activate: [index: number | null] }>()

const root = ref<HTMLElement | null>(null)
// What the reader chose by clicking a section; it wins over the automatic opening while typing.
const overrides = ref<Record<string, boolean>>({})

function isOpen(section: RenderedSection): boolean {
  return sectionOpen({
    override: overrides.value[section.id],
    writing: section.writing,
    hasBody: section.html.length > 0
  })
}

function onToggle(section: RenderedSection, open: boolean): void {
  // Opening and closing by the app also fires "toggle"; only a difference is the reader's choice.
  if (open !== isOpen(section)) overrides.value = { ...overrides.value, [section.id]: open }
}

function markerIndex(event: Event): number | null {
  if (!(event.target instanceof Element)) return null
  const marker = event.target.closest<HTMLElement>('[data-citation-index]')
  const index = Number(marker?.dataset.citationIndex)
  return marker && root.value?.contains(marker) && Number.isInteger(index) ? index : null
}

function onClick(event: MouseEvent): void {
  const index = markerIndex(event)
  if (index !== null) emit('open', index)
}

function onEnter(event: Event): void {
  const index = markerIndex(event)
  if (index !== null) emit('activate', index)
}

function onLeave(event: Event): void {
  if (markerIndex(event) !== null) emit('activate', null)
}

function syncLinkedMarkers(): void {
  root.value?.querySelectorAll<HTMLElement>('.answer-citation').forEach((marker) => {
    marker.classList.toggle('is-linked', Number(marker.dataset.citationIndex) === props.linkedIndex)
  })
}

// The HTML is a string, so linked state is applied to the rendered markers after each update.
watch(
  () => [props.answer, props.linkedIndex],
  () => void nextTick(syncLinkedMarkers),
  { flush: 'post', immediate: true }
)

watch(
  () => props.answer.sections.length,
  (count) => {
    if (count === 0) overrides.value = {}
  }
)
</script>

<template>
  <!-- eslint-disable vue/no-v-html -->
  <div
    ref="root"
    class="search-answer"
    :aria-busy="busy"
    @click="onClick"
    @mouseover="onEnter"
    @mouseout="onLeave"
    @focusin="onEnter"
    @focusout="onLeave"
  >
    <div v-if="answer.lead" class="answer-lead" v-html="answer.lead" />

    <TransitionGroup
      v-if="answer.sections.length > 0"
      name="section"
      tag="div"
      class="answer-sections"
    >
      <template v-for="section in answer.sections" :key="section.id">
        <SearchTimeline
          v-if="section.timeline"
          :key="section.id"
          :title="section.title"
          :steps="section.timeline"
          :writing="section.writing"
        />
        <StDisclosure
          v-else
          :key="section.id"
          class="answer-section"
          :open="isOpen(section)"
          @update:open="onToggle(section, $event)"
        >
          <template #summary>
            <span class="section-title">{{ section.title }}</span>
          </template>
          <div v-if="section.html" class="section-body" v-html="section.html" />
        </StDisclosure>
      </template>
    </TransitionGroup>
  </div>
  <!-- eslint-enable vue/no-v-html -->
</template>

<style scoped>
.search-answer {
  color: var(--sp-text);
  font-family: var(--st-font-sans);
  overflow-wrap: anywhere;
}

.answer-lead {
  font-size: var(--st-type-body-xl-size);
  line-height: var(--st-type-body-xl-leading);
}

.answer-sections {
  display: flex;
  flex-direction: column;
  margin-top: var(--st-space-200);
}

.answer-lead + .answer-sections {
  margin-top: var(--st-space-250);
}

/* Each area fades and rises into place as the summary reaches it. */
.section-enter-active {
  transition:
    opacity 420ms ease-out,
    transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

.section-enter-from {
  opacity: 0;
  transform: translateY(var(--st-space-100));
}

.answer-section :deep(.st-disclosure-summary) {
  padding: var(--st-space-100) 0;
  color: var(--sp-text);
  font-size: var(--st-type-headline-sm-size);
  font-weight: var(--st-type-headline-sm-weight);
  line-height: var(--st-type-headline-sm-leading);
}

.answer-section :deep(.st-disclosure-summary:hover) {
  color: var(--sp-link-strong);
}

.section-body {
  padding: 0 0 var(--st-space-150) var(--st-space-250);
  font-size: var(--st-type-body-lg-size);
  line-height: var(--st-type-body-lg-leading);
}

.search-answer :deep(p) {
  margin: 0 0 var(--st-space-200);
}

.search-answer :deep(p:last-child) {
  margin-bottom: 0;
}

.search-answer :deep(h1),
.search-answer :deep(h2),
.search-answer :deep(h3),
.search-answer :deep(h4) {
  margin: 0 0 var(--st-space-50);
  color: var(--sp-text);
  font-size: inherit;
  font-weight: var(--st-font-weight-bold);
  line-height: var(--st-line-height-400);
}

.search-answer :deep(ul),
.search-answer :deep(ol) {
  margin: 0 0 var(--st-space-200);
  padding-left: 1.4em;
}

.search-answer :deep(ul) {
  list-style: disc;
}

.search-answer :deep(li) {
  margin: var(--st-space-50) 0;
}

.search-answer :deep(strong) {
  font-weight: var(--st-font-weight-bold);
}

.search-answer :deep(code) {
  padding: var(--st-space-1) var(--st-space-50);
  color: var(--sp-link-strong);
  background: var(--st-color-surface-hover);
  border-radius: var(--st-space-50);
  font-family: var(--st-font-mono);
  font-size: var(--st-font-size-150);
  font-weight: var(--st-font-weight-medium);
}

.search-answer :deep(pre) {
  margin: 0 0 var(--st-space-200);
  padding: var(--st-space-150);
  overflow-x: auto;
  border: var(--st-border-100) solid var(--sp-border);
  border-radius: var(--st-space-100);
  font-size: var(--st-type-body-md-size);
  line-height: var(--st-type-body-md-leading);
}

.search-answer :deep(pre code) {
  padding: 0;
  background: transparent;
}

.search-answer :deep(.answer-citation-ref) {
  margin-left: 0;
  font-size: var(--st-type-body-sm-size);
  line-height: var(--st-type-body-sm-leading);
}

.search-answer :deep(.answer-citation-ref + .answer-citation-ref) {
  margin-left: var(--st-space-50);
}

.search-answer :deep(.answer-citation) {
  padding: var(--st-space-25) var(--st-space-1);
  color: var(--sp-link);
  background: transparent;
  border: 0;
  border-radius: var(--st-space-50);
  cursor: pointer;
  font: inherit;
  line-height: var(--st-line-height-100);
}

.search-answer :deep(.answer-citation:hover),
.search-answer :deep(.answer-citation.is-linked) {
  color: var(--sp-link-strong);
  background: var(--sp-link-wash);
}

.search-answer :deep(.answer-citation:focus-visible) {
  outline: var(--st-border-200) solid var(--sp-focus);
  outline-offset: var(--st-space-1);
}

/* The caret follows the last typed word and disappears when typing ends. */
.search-answer :deep(.answer-caret) {
  display: inline-block;
  width: var(--st-block-25);
  height: 1.05em;
  margin-left: var(--st-space-25);
  vertical-align: text-bottom;
  background: var(--sp-text-2);
  border-radius: var(--st-space-1);
  animation: caret-pulse 1.1s ease-in-out infinite;
}

@keyframes caret-pulse {
  50% {
    opacity: 0.25;
  }
}

@media (prefers-reduced-motion: reduce) {
  .search-answer :deep(.answer-caret) {
    animation: none;
  }

  .section-enter-active {
    transition: none;
  }
}
</style>
