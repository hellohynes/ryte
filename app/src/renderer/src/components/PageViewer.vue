<script setup lang="ts">
/**
 * The tab for an HTML page. The page itself is drawn by a separate locked view that the main process places over
 * this tab's content area, so this component only reports where that area is. A native view always draws on
 * top, so while an overlay is open the view is hidden and a still picture of the page shows in its place.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useViewerStore } from '../stores/viewer'
import StButton from '../stencil/components/StButton.vue'
import StNotice from '../stencil/components/StNotice.vue'
import {
  bannerText,
  dismissBanner,
  emptyBannerState,
  receiveReport,
  visibleBanner
} from './page-blocked-model'
import {
  describePageProblem,
  isOverlayOpen,
  pageBoundsOf,
  type PageProblem
} from './page-tab-model'

const props = defineProps<{
  /** The page's path relative to the notes folder. */
  path: string
}>()

const viewer = useViewerStore()

const name = computed(() => props.path.slice(props.path.lastIndexOf('/') + 1))
const stage = ref<HTMLElement | null>(null)
const problem = ref<PageProblem | null>(null)
const still = ref<string | null>(null)
const banner = ref(emptyBannerState())
const bannerView = computed(() => visibleBanner(banner.value))
const showAddresses = ref(false)

const stopBlocked = window.ryte.page.onBlocked((report) => {
  banner.value = receiveReport(banner.value, report)
})

function dismiss(): void {
  banner.value = dismissBanner(banner.value)
  showAddresses.value = false
}

let covered = false
let opened = false
let alive = true
let queue: Promise<void> = Promise.resolve()

// The calls to the main process run one after another, so a quick overlay open and close can't cross.
function enqueue(task: () => Promise<void>): void {
  queue = queue.then(task, task).catch(() => undefined)
}

function currentBounds(): ReturnType<typeof pageBoundsOf> | null {
  return stage.value ? pageBoundsOf(stage.value.getBoundingClientRect()) : null
}

async function showPage(): Promise<void> {
  const bounds = currentBounds()
  if (!bounds || !alive) return
  const { status } = await window.ryte.page.show({ path: props.path, bounds })
  if (!alive) return
  if (status === 'shown') {
    problem.value = null
    opened = true
    still.value = null
  } else {
    problem.value = status
    opened = false
  }
}

function reload(): void {
  enqueue(async () => {
    await window.ryte.page.close()
    opened = false
    if (!covered) await showPage()
  })
}

function syncBounds(): void {
  if (!opened || covered) return
  const bounds = currentBounds()
  if (bounds) void window.ryte.page.setBounds({ bounds }).catch(() => undefined)
}

function syncOverlay(): void {
  const next = isOverlayOpen(document)
  if (next === covered) return
  covered = next
  enqueue(async () => {
    if (!alive) return
    if (covered) {
      if (!opened) return
      const result = await window.ryte.page.hide()
      if (covered) still.value = result.still
    } else {
      // Also after a reload that was skipped while covered: nothing is open, so show the page again.
      await showPage()
    }
  })
}

let frame: number | null = null
function scheduleOverlaySync(): void {
  if (frame !== null) return
  frame = window.requestAnimationFrame(() => {
    frame = null
    syncOverlay()
  })
}

let resizeObserver: ResizeObserver | null = null
let mutationObserver: MutationObserver | null = null

onMounted(() => {
  // A page opened while a dialog is still up must not draw over it; it shows when the overlay closes.
  covered = isOverlayOpen(document)
  if (!covered) enqueue(showPage)
  if (stage.value) {
    resizeObserver = new ResizeObserver(syncBounds)
    resizeObserver.observe(stage.value)
  }
  window.addEventListener('resize', syncBounds)
  // Opening a menu or toast does not change the DOM, but it fires `toggle` (which does not bubble).
  document.addEventListener('toggle', scheduleOverlaySync, true)
  mutationObserver = new MutationObserver(scheduleOverlaySync)
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['open', 'aria-modal']
  })
})

onBeforeUnmount(() => {
  alive = false
  stopBlocked()
  resizeObserver?.disconnect()
  mutationObserver?.disconnect()
  window.removeEventListener('resize', syncBounds)
  document.removeEventListener('toggle', scheduleOverlaySync, true)
  if (frame !== null) window.cancelAnimationFrame(frame)
  void window.ryte.page.close().catch(() => undefined)
})

watch(() => viewer.pageVersion, reload)
</script>

<template>
  <div class="page-tab">
    <header class="page-caption">
      <span class="page-name">{{ name }}</span>
    </header>
    <StNotice
      v-if="bannerView"
      tone="warning"
      dismissible
      class="page-banner"
      data-page-banner
      @dismiss="dismiss"
    >
      {{ bannerText(bannerView.count) }}
      <template #actions>
        <StButton variant="secondary" size="sm" @click="showAddresses = !showAddresses">
          {{ showAddresses ? 'Hide addresses' : 'Show addresses' }}
        </StButton>
      </template>
    </StNotice>
    <ul v-if="bannerView && showAddresses" class="page-banner-list" data-page-banner-list>
      <li v-for="(address, index) in bannerView.addresses" :key="index">{{ address }}</li>
    </ul>
    <p v-if="problem" class="page-problem">{{ describePageProblem(problem, path) }}</p>
    <div v-show="!problem" ref="stage" class="page-stage" data-page-stage>
      <img v-if="still" class="page-still" :src="still" alt="" />
    </div>
  </div>
</template>

<style scoped>
.page-tab {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--st-space-100);
  padding: var(--st-space-300) 0 0;
}

.page-caption {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--st-space-100) var(--st-space-200);
  padding: 0 var(--st-space-400);
}

.page-name {
  font: var(--st-type-label-md);
  color: var(--st-color-text-primary);
  overflow-wrap: anywhere;
}

.page-banner {
  margin: 0 var(--st-space-400);
}

.page-banner-list {
  margin: 0 var(--st-space-400);
  padding: var(--st-space-100) var(--st-space-200) var(--st-space-100) var(--st-space-400);
  max-height: calc(var(--st-block-base) * 8);
  overflow: auto;
  font: var(--st-type-body-sm);
  color: var(--st-color-text-muted);
  overflow-wrap: anywhere;
}

.page-problem {
  margin: 0;
  padding: var(--st-space-200) var(--st-space-400);
  color: var(--st-color-text-muted);
}

.page-stage {
  position: relative;
  flex: 1;
  min-height: 0;
}

.page-still {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
}
</style>
