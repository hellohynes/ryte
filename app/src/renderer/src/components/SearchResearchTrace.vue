<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import StIcon from '../stencil/icons/StIcon.vue'
import type { TraceLine } from './research-trace-model'

const props = defineProps<{
  /** True while the search is still thinking; the box is open and the header shimmers. */
  thinking: boolean
  /** "Thinking…" while it runs, then "Thought for 6s" or "Saved summary". */
  label: string
  lines: TraceLine[]
}>()

// Open while the work happens, then folded away so the answer takes over.
const open = ref(props.thinking)
watch(
  () => props.thinking,
  (thinking) => (open.value = thinking)
)

const viewport = ref<HTMLElement | null>(null)
const fadeTop = ref(false)
const fadeBottom = ref(false)
const panelId = `search-trace-${Math.random().toString(36).slice(2, 8)}`

function updateFades(): void {
  const el = viewport.value
  if (!el) return
  fadeTop.value = el.scrollTop > 1
  fadeBottom.value = el.scrollTop + el.clientHeight < el.scrollHeight - 1
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

// Once the box is full, the newest sentence stays in view and older ones drift up under a fade.
watch(
  () => props.lines.length,
  async () => {
    await nextTick()
    const el = viewport.value
    if (!el) return
    if (props.thinking) {
      el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion() ? 'auto' : 'smooth' })
    }
    updateFades()
  }
)

watch(open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  if (viewport.value) viewport.value.scrollTop = props.thinking ? viewport.value.scrollHeight : 0
  updateFades()
})
</script>

<template>
  <div class="trace">
    <button
      type="button"
      class="trace-toggle"
      :class="{ shimmer: thinking }"
      :aria-expanded="open"
      :aria-controls="panelId"
      :disabled="thinking"
      @click="open = !open"
    >
      <span class="trace-label">{{ label }}</span>
      <StIcon
        v-if="!thinking"
        name="chevron-right"
        :size="12"
        class="trace-chevron"
        :class="{ open }"
      />
    </button>

    <div class="trace-collapsible" :class="{ collapsed: !open }">
      <div class="trace-clip">
        <div
          :id="panelId"
          ref="viewport"
          class="trace-viewport"
          :class="{ 'fade-top': fadeTop, 'fade-bottom': fadeBottom }"
          @scroll="updateFades"
        >
          <TransitionGroup name="trace-line" tag="div" class="trace-lines">
            <p
              v-for="line in lines"
              :key="line.id"
              class="trace-line"
              :class="[line.state, { wash: thinking && line.state === 'active' }]"
            >
              <!-- The newest line is rewritten in place as the work moves on. -->
              <span :key="line.text" class="line-text">
                <span class="line-wash">{{ line.text }}</span>
              </span>
            </p>
          </TransitionGroup>
        </div>
      </div>
    </div>

    <p class="sr-only" role="status">{{ thinking ? (lines.at(-1)?.text ?? '') : '' }}</p>
  </div>
</template>

<style scoped>
.trace {
  display: flex;
  flex-direction: column;
  gap: var(--st-space-50);
  padding-bottom: var(--st-space-100);
}

.trace-toggle {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: var(--st-space-50);
  max-width: 100%;
  padding: 0;
  color: var(--sp-text-2);
  background: transparent;
  border: 0;
  border-radius: var(--st-space-50);
  cursor: pointer;
  font: inherit;
  font-size: var(--st-type-body-md-size);
  line-height: var(--st-type-body-md-leading);
}

.trace-toggle:disabled {
  cursor: default;
}

.trace-toggle:not(:disabled):hover {
  color: var(--sp-text);
}

.trace-toggle:focus-visible {
  outline: var(--st-border-200) solid var(--sp-focus);
  outline-offset: var(--st-space-25);
}

/* While thinking, a soft highlight sweeps across the header text, left to right. */
.trace-toggle.shimmer .trace-label {
  color: transparent;
  background: linear-gradient(
      90deg,
      var(--sp-text-3) 0%,
      var(--sp-text-3) 35%,
      var(--sp-text) 50%,
      var(--sp-text-3) 65%,
      var(--sp-text-3) 100%
    )
    0 0 / 250% 100%;
  background-clip: text;
  animation: trace-shimmer 1.8s linear infinite;
}

.trace-chevron {
  transition: transform 150ms ease-out;
}

.trace-chevron.open {
  transform: rotate(90deg);
}

/* Folding animates the row height, so the answer below glides up rather than jumping. */
.trace-collapsible {
  display: grid;
  grid-template-rows: 1fr;
  transition:
    grid-template-rows 320ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 220ms ease-out;
}

.trace-collapsible.collapsed {
  grid-template-rows: 0fr;
  opacity: 0;
}

.trace-clip {
  min-height: 0;
  overflow: hidden;
}

.trace-viewport {
  --trace-fade: calc(var(--st-block-250) + var(--st-block-25));

  box-sizing: content-box;
  max-height: var(--st-layout-175);
  padding: var(--st-space-125) var(--st-space-150);
  overflow-y: auto;
  scrollbar-width: none;
  color: var(--sp-text-3);
  border: var(--st-border-100) solid var(--sp-border);
  border-radius: var(--st-space-100);
  font-size: var(--st-type-body-md-size);
  line-height: var(--st-type-body-md-leading);
}

.trace-viewport::-webkit-scrollbar {
  display: none;
}

.trace-viewport.fade-top {
  mask-image: linear-gradient(to bottom, transparent 0, var(--st-neutral-black) var(--trace-fade));
}

.trace-viewport.fade-bottom {
  mask-image: linear-gradient(
    to bottom,
    var(--st-neutral-black) calc(100% - var(--trace-fade)),
    transparent 100%
  );
}

.trace-viewport.fade-top.fade-bottom {
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    var(--st-neutral-black) var(--trace-fade),
    var(--st-neutral-black) calc(100% - var(--trace-fade)),
    transparent 100%
  );
}

.trace-lines {
  display: flex;
  flex-direction: column;
  gap: var(--st-space-50);
}

.trace-line.active {
  color: var(--sp-text-2);
}

/* New wording fades in where the old wording was. */
.line-text {
  animation: line-text-in 220ms ease-out;
}

@keyframes line-text-in {
  from {
    opacity: 0;
  }
}

/* A soft highlight keeps sweeping across the line that is still being worked on. */
.trace-line.wash .line-wash {
  color: transparent;
  background: linear-gradient(
      90deg,
      var(--sp-text-3) 0%,
      var(--sp-text-3) 35%,
      var(--sp-text) 50%,
      var(--sp-text-3) 65%,
      var(--sp-text-3) 100%
    )
    0 0 / 250% 100%;
  background-clip: text;
  animation: trace-shimmer 1.8s linear infinite;
}

.sr-only {
  position: absolute;
  width: var(--st-block-1);
  height: var(--st-block-1);
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@keyframes trace-shimmer {
  from {
    background-position: 100% 0;
  }

  to {
    background-position: -100% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .trace-toggle.shimmer .trace-label,
  .trace-line.wash .line-wash {
    color: var(--sp-text-2);
    background: none;
    animation: none;
  }

  .trace-chevron,
  .trace-collapsible,
  .trace-line-enter-active {
    transition: none;
  }

  .line-text {
    animation: none;
  }
}
</style>
