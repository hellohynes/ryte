<script setup lang="ts">
import { computed } from 'vue'

import { referenceLabel, referenceUrl } from '../../../shared/reference-links'
import type { RenderedTimelineItem } from '../composables/useRenderedAnswer'
import { useSettingsStore } from '../stores/settings'
import StIcon from '../stencil/icons/StIcon.vue'
import { groupTimeline } from './timeline-groups'

const props = defineProps<{
  title: string
  steps: RenderedTimelineItem[]
  /** The summary is still writing this section. */
  writing: boolean
}>()

// Read once, on purpose: a timeline that mounts while it is being written draws itself in step by
// step, but a saved or finished one just shows. Finishing a live one must not cut its last step's
// animation short, which a reactive class would.
const animated = props.writing

// How each step's state is named, in the vocabulary of the tickets the steps point to.
const STATUS_WORDS = { done: 'Done', now: 'In Progress', next: 'Backlog' } as const

const groups = computed(() => groupTimeline(props.steps))

// A full address from a note links as it is. A bare key or number links only under a base saved
// earlier (Preferences no longer shows these); otherwise it stays plain text.
const settings = useSettingsStore()
const linkBases = computed(() => ({
  ticket: settings.state?.ticketLinkBase ?? '',
  pullRequest: settings.state?.pullRequestLinkBase ?? ''
}))
function linkFor(reference: string): string | null {
  return referenceUrl(reference, linkBases.value)
}
</script>

<template>
  <!-- eslint-disable vue/no-v-html -->
  <section class="answer-timeline" :class="{ 'is-animated': animated }" :aria-label="title">
    <h2 class="timeline-heading">{{ title }}</h2>
    <ol class="timeline">
      <!-- Until the first step is readable: the circle it will become, and the lines it will fill. -->
      <li v-if="steps.length === 0" class="timeline-step placeholder" aria-hidden="true">
        <span class="timeline-rail">
          <span class="timeline-marker"><span class="timeline-dot" /></span>
        </span>
        <span class="timeline-body">
          <span class="timeline-content">
            <span class="placeholder-line placeholder-line--meta"
              ><span class="placeholder-bar"
            /></span>
            <span class="placeholder-line placeholder-line--text"
              ><span class="placeholder-bar"
            /></span>
          </span>
        </span>
      </li>
      <li
        v-for="(group, groupIndex) in groups"
        :key="group.first"
        class="timeline-step"
        :class="[group.status, { 'has-line-above': groupIndex > 0 }]"
      >
        <span class="timeline-rail" aria-hidden="true">
          <span class="timeline-marker">
            <!-- Every step starts as a plain circle; a finished one turns into the check. -->
            <span class="timeline-dot" />
            <StIcon v-if="group.status === 'done'" name="check" :size="12" class="timeline-check" />
          </span>
          <span v-if="groupIndex < groups.length - 1" class="timeline-line" />
        </span>
        <!-- Backlog steps share their node, so those after the first sit below it, unlabelled. -->
        <span class="timeline-body">
          <span
            v-for="(step, itemIndex) in group.items"
            :key="itemIndex"
            class="timeline-content"
            :class="{ continued: itemIndex > 0 }"
          >
            <span v-if="itemIndex === 0 || step.refs.length || step.date" class="timeline-meta">
              <span v-if="step.refs.length" class="timeline-refs">
                <template v-for="(reference, refIndex) in step.refs" :key="refIndex">
                  <span v-if="refIndex > 0" class="timeline-sep"> / </span>
                  <a
                    v-if="linkFor(reference)"
                    class="timeline-ref"
                    :href="linkFor(reference) ?? undefined"
                    target="_blank"
                    rel="noopener noreferrer"
                    >{{ referenceLabel(reference) }}</a
                  >
                  <span v-else class="timeline-ref">{{ referenceLabel(reference) }}</span>
                </template>
              </span>
              <template v-if="itemIndex === 0">
                <template v-if="step.refs.length">{{ ' ' }}</template>
                <span class="timeline-status">{{ STATUS_WORDS[step.status] }}</span>
                <span v-if="step.date" class="timeline-date">, {{ step.date }}</span>
              </template>
              <template v-else-if="step.date">
                <template v-if="step.refs.length">{{ ' ' }}</template>
                <span class="timeline-date">{{ step.date }}</span>
              </template>
            </span>
            <span class="timeline-text" v-html="step.html" />
          </span>
        </span>
      </li>
    </ol>
  </section>
  <!-- eslint-enable vue/no-v-html -->
</template>

<style scoped>
/* Where things stand, as a vertical timeline: just done above, now highlighted, next below. */
.answer-timeline {
  padding: var(--st-space-50) 0 var(--st-space-150);
  /* A step's rail waits this long for the line from the step above to reach it. */
  --timeline-lead: 0ms;
}

.timeline-heading {
  padding: var(--st-space-50) 0 var(--st-space-100);
  color: var(--sp-text);
  font-size: var(--st-type-headline-sm-size);
  font-weight: var(--st-type-headline-sm-weight);
  line-height: var(--st-type-headline-sm-leading);
}

/* These sit under the answer's `:deep(ol)` and `:deep(li)` rules, so they are scoped one level up
   to win over the list indent and item margin. */
.answer-timeline .timeline {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
}

.answer-timeline .timeline-step {
  display: flex;
  gap: var(--st-space-125);
  align-items: stretch;
  margin: 0;
}

.timeline-step.has-line-above {
  --timeline-lead: 340ms;
}

/* The rail: a check for finished work, a dot for the rest, and a line down to the next step. */
.timeline-rail {
  display: flex;
  flex: 0 0 var(--st-block-200);
  flex-direction: column;
  align-items: center;
}

.timeline-marker {
  display: grid;
  width: var(--st-block-200);
  height: var(--st-block-150);
  place-items: end center;
}

.timeline-step.done .timeline-marker {
  height: var(--st-block-200);
  place-items: center;
}

.timeline-marker > * {
  grid-area: 1 / 1;
}

.timeline-dot {
  position: relative;
  box-sizing: border-box;
  width: var(--st-block-100);
  height: var(--st-block-100);
  border-radius: var(--st-radius-circle);
}

.timeline-step.done .timeline-dot {
  background: var(--st-color-surface-active);
  opacity: 0;
}

.timeline-check {
  color: var(--st-color-text-primary);
}

.timeline-step.now .timeline-dot {
  background: var(--sp-link);
  box-shadow: 0 0 0 calc(var(--st-border-150) * 2) var(--sp-link-wash);
}

.timeline-step.next .timeline-dot {
  background: var(--st-color-surface-base);
  border: var(--st-border-150) solid var(--st-color-border-contrast);
}

/* The current step gives off a soft ring that grows and fades. */
.timeline-step.now .timeline-dot::after {
  position: absolute;
  inset: 0;
  background: var(--sp-link);
  border-radius: var(--st-radius-circle);
  content: '';
  opacity: 0;
}

.timeline-line {
  flex: 1 1 auto;
  width: var(--st-block-1);
  min-height: var(--st-block-50);
  background: var(--st-color-surface-active);
}

.timeline-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.timeline-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  /* The room between one step's text and the next step's label. */
  padding-bottom: var(--st-space-125);
}

/* Ticket and PR references, then the state in its own colour, then the date. */
.timeline-meta {
  position: relative;
  top: var(--st-space-1-negative);
  color: var(--sp-text-3);
  font-size: var(--st-type-caption-sm-size);
  line-height: var(--st-type-caption-sm-leading);
}

.timeline-ref,
.timeline-status {
  font-weight: var(--st-font-weight-semi-bold);
}

.timeline-ref {
  color: var(--st-color-text-secondary);
  text-decoration: underline;
}

a.timeline-ref:hover {
  color: var(--sp-link-strong);
}

a.timeline-ref:focus-visible {
  outline: var(--st-border-200) solid var(--sp-focus);
  outline-offset: var(--st-space-25);
  border-radius: var(--st-space-25);
}

.timeline-sep,
.timeline-date {
  font-weight: var(--st-font-weight-normal);
}

.timeline-refs ~ .timeline-status {
  margin-left: var(--st-space-25);
}

.timeline-step.done .timeline-status {
  color: var(--sp-done);
}

.timeline-step.now .timeline-status {
  color: var(--sp-link);
}

.timeline-text {
  font-size: var(--st-type-body-lg-size);
  line-height: var(--st-type-body-lg-leading);
}

/* The stand-in for the first step has the real step's height, so nothing moves when it arrives. */
.placeholder .timeline-dot {
  background: var(--st-color-surface-active);
}

.placeholder-line {
  display: flex;
  align-items: center;
}

.placeholder-line--meta {
  height: var(--st-block-200);
}

.placeholder-line--text {
  height: var(--st-block-300);
}

.placeholder-bar {
  display: block;
  width: 38%;
  height: var(--st-block-100);
  border-radius: var(--st-space-50);
  background: var(--sp-hover);
}

.placeholder-line--meta .placeholder-bar {
  width: 18%;
  height: var(--st-block-75);
}

/* Each step draws itself in: the line from the step above reaches down, the circle pops in, then
   settles into what the step is: a check for done, a filled blue circle for now, a hollow one for
   next. Only a timeline that was mounting while it was written moves. */
@media (prefers-reduced-motion: no-preference) {
  .placeholder .timeline-dot {
    animation: timeline-breathe 1.4s ease-in-out infinite;
  }

  .placeholder-bar {
    background: linear-gradient(
        90deg,
        var(--sp-hover) 0%,
        var(--st-color-surface-hover) 50%,
        var(--sp-hover) 100%
      )
      0 0 / 250% 100%;
    animation: timeline-sweep 1.4s ease-in-out infinite;
  }

  .is-animated .timeline-line {
    transform-origin: top;
    animation: timeline-line-draw 340ms cubic-bezier(0.4, 0, 0.2, 1) backwards;
  }

  .is-animated .timeline-content {
    animation: timeline-content-in 360ms ease-out calc(var(--timeline-lead) + 120ms) backwards;
  }

  /* A step added under an existing node has no lead-in to wait for. */
  .is-animated .timeline-content.continued {
    animation: timeline-content-in 360ms ease-out backwards;
  }

  .is-animated .timeline-step.done .timeline-dot {
    animation: timeline-dot-done 1000ms ease-out var(--timeline-lead) both;
  }

  .is-animated .timeline-step.now .timeline-dot {
    animation: timeline-dot-now 1000ms ease-out var(--timeline-lead) both;
  }

  .is-animated .timeline-step.next .timeline-dot {
    animation: timeline-dot-next 1000ms ease-out var(--timeline-lead) both;
  }

  .is-animated .timeline-check {
    animation: timeline-check-draw 380ms ease-out calc(var(--timeline-lead) + 420ms) backwards;
  }

  /* Three slow pulses once the circle has turned blue, then it rests with its soft ring. */
  .is-animated .timeline-step.now .timeline-dot::after {
    animation: timeline-pulse 2400ms ease-out calc(var(--timeline-lead) + 1000ms) 3 forwards;
  }
}

@keyframes timeline-line-draw {
  from {
    transform: scaleY(0);
  }
}

@keyframes timeline-content-in {
  from {
    opacity: 0;
    transform: translateY(var(--st-space-50));
  }
}

@keyframes timeline-dot-done {
  0% {
    opacity: 0;
    transform: scale(0.3);
  }

  26%,
  42% {
    opacity: 1;
    transform: scale(1);
  }

  74%,
  100% {
    opacity: 0;
    transform: scale(0.3);
  }
}

@keyframes timeline-dot-now {
  0% {
    background: var(--st-color-surface-active);
    box-shadow: 0 0 0 0 transparent;
    opacity: 0;
    transform: scale(0.3);
  }

  26% {
    opacity: 1;
    transform: scale(1);
  }

  42% {
    background: var(--st-color-surface-active);
    box-shadow: 0 0 0 0 transparent;
  }

  74%,
  100% {
    background: var(--sp-link);
    box-shadow: 0 0 0 calc(var(--st-border-150) * 2) var(--sp-link-wash);
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes timeline-dot-next {
  0% {
    background: var(--st-color-surface-active);
    border-color: var(--st-color-border-strong);
    opacity: 0;
    transform: scale(0.3);
  }

  26% {
    opacity: 1;
    transform: scale(1);
  }

  42% {
    background: var(--st-color-surface-active);
    border-color: var(--st-color-border-strong);
  }

  74%,
  100% {
    background: var(--st-color-surface-base);
    border-color: var(--st-color-border-contrast);
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes timeline-check-draw {
  from {
    clip-path: inset(0 100% 0 0);
  }

  to {
    clip-path: inset(0 0 0 0);
  }
}

@keyframes timeline-pulse {
  from {
    opacity: 0.4;
    transform: scale(1);
  }

  to {
    opacity: 0;
    transform: scale(3.2);
  }
}

@keyframes timeline-breathe {
  50% {
    opacity: 0.45;
  }
}

@keyframes timeline-sweep {
  from {
    background-position: 100% 0;
  }

  to {
    background-position: -150% 0;
  }
}
</style>
