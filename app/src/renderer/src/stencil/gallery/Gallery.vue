<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch } from 'vue'

import StIcon from '../icons/StIcon.vue'
import type { IconName } from '../icons/icons.generated'
import ColorSection from './sections/ColorSection.vue'
import FoundationsSection from './sections/FoundationsSection.vue'
import ComponentsSection from './sections/ComponentsSection.vue'
import OverlaysSection from './sections/OverlaysSection.vue'
import IconsSection from './sections/IconsSection.vue'
import PrinciplesSection from './sections/PrinciplesSection.vue'
import TypeSection from './sections/TypeSection.vue'

const SECTIONS = [
  { id: 'principles', label: 'Principles', icon: 'list-bullet' },
  { id: 'color', label: 'Color', icon: 'drop' },
  { id: 'type', label: 'Typography', icon: 'type' },
  { id: 'foundations', label: 'Foundations', icon: 'sidebar' },
  { id: 'icons', label: 'Iconography', icon: 'grid' },
  { id: 'components', label: 'Components', icon: 'columns' },
  { id: 'overlays', label: 'Overlays', icon: 'copy' }
] as const satisfies ReadonlyArray<{ id: string; label: string; icon: IconName }>

const theme = ref<'light' | 'dark'>(
  matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
)
const active = ref<string>(SECTIONS[0].id)
const onSite = import.meta.env.PROD

// The filter hides gallery items whose text does not contain every word typed.
const ITEMS =
  '.g-swatch, .g-icon, .g-leading, .g-specimen, .g-reader, .g-rule, .g-blocks > div, .g-table tbody tr'
const query = ref('')
const shown = ref<number | null>(null)
const search = ref<HTMLInputElement>()

const normalize = (text: string): string => text.toLowerCase().replace(/[-_]+/g, ' ')

function applyFilter(): void {
  const words = normalize(query.value).split(/\s+/).filter(Boolean)
  let visible = 0
  for (const item of document.querySelectorAll<HTMLElement>(ITEMS)) {
    const text = normalize(item.textContent ?? '')
    const match = words.every((word) => text.includes(word))
    item.hidden = !match
    if (match) visible++
  }
  const filtering = words.length > 0
  for (const sub of document.querySelectorAll<HTMLElement>('.g-sub')) {
    const items = sub.querySelectorAll<HTMLElement>(ITEMS)
    sub.hidden = filtering && [...items].every((item) => item.hidden)
  }
  for (const section of document.querySelectorAll<HTMLElement>('main section')) {
    const items = section.querySelectorAll<HTMLElement>(ITEMS)
    section.hidden = filtering && [...items].every((item) => item.hidden)
  }
  shown.value = words.length > 0 ? visible : null
}

watch(query, () => nextTick(applyFilter))
onUpdated(() => {
  if (query.value) applyFilter()
})

function onKey(event: KeyboardEvent): void {
  const typing = (event.target as HTMLElement).matches('input, textarea')
  if (event.key === '/' && !typing) {
    event.preventDefault()
    search.value?.focus()
  } else if (event.key === 'Escape' && event.target === search.value) {
    query.value = ''
    search.value?.blur()
  }
}

function setTheme(next: 'light' | 'dark'): void {
  theme.value = next
  document.documentElement.dataset.theme = next
}

let observer: IntersectionObserver | undefined
onMounted(() => {
  window.addEventListener('keydown', onKey)
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) active.value = entry.target.id
    },
    { rootMargin: '-30% 0px -60% 0px' }
  )
  for (const { id } of SECTIONS) {
    const el = document.getElementById(id)
    if (el) observer.observe(el)
  }
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="g-topbar">
    <label class="g-search">
      <StIcon name="search" :size="14" />
      <input
        ref="search"
        v-model="query"
        type="search"
        placeholder="Filter"
        aria-label="Filter the gallery"
        autocomplete="off"
        spellcheck="false"
      />
      <span v-if="shown !== null" class="g-mono">{{ shown }}</span>
      <kbd v-else class="g-mono">/</kbd>
    </label>
    <div class="g-theme" role="group" aria-label="Theme">
      <button type="button" :aria-pressed="theme === 'light'" @click="setTheme('light')">
        <StIcon name="sun" :size="14" />Light
      </button>
      <button type="button" :aria-pressed="theme === 'dark'" @click="setTheme('dark')">
        <StIcon name="moon" :size="14" />Dark
      </button>
    </div>
  </div>

  <nav class="g-nav" aria-label="Sections">
    <a
      v-for="(section, index) in SECTIONS"
      :key="section.id"
      :href="`#${section.id}`"
      :class="{ on: active === section.id }"
    >
      <span class="g-mono">0{{ index + 1 }}.</span>
      <StIcon :name="section.icon" :size="14" />
      {{ section.label }}
    </a>
  </nav>

  <main class="g-main">
    <header class="g-hero">
      <!-- Only on the published site, where the landing page is one level up. -->
      <a v-if="onSite" class="g-home" href="../">Ryte</a>
      <h1>Stencil</h1>
      <p>Ryte's design system.</p>
    </header>
    <p v-if="shown === 0" class="g-empty">No matches.</p>
    <PrinciplesSection />
    <ColorSection />
    <TypeSection />
    <FoundationsSection />
    <IconsSection />
    <ComponentsSection />
    <OverlaysSection />
  </main>
</template>
