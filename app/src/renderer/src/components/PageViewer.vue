<script setup lang="ts">
/**
 * The tab for an HTML page, or for a local address (`url`). The page itself is drawn by a separate view that the main process places over
 * this tab's content area, so this component only reports where that area is. A native view always draws on
 * top, so while an overlay is open the view is hidden and a still picture of the page shows in its place.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { describeOrigin, parseLocalAddress } from '../../../shared/local-address'
import { useLocalAddressStore } from '../stores/local-address'
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
  /** The page's path relative to the notes folder. Not set for a local address. */
  path?: string
  /** The local address to show instead of a file. */
  url?: string
}>()

const viewer = useViewerStore()
const local = useLocalAddressStore()

const name = computed(() =>
  props.url
    ? describeOrigin(parseLocalAddress(props.url)?.origin ?? props.url)
    : (props.path ?? '').slice((props.path ?? '').lastIndexOf('/') + 1)
)
// A local address and an HTML file are shown through the same kind of view, by different operations.
const views = computed(() => (props.url ? window.ryte.localhost : window.ryte.page))
const stage = ref<HTMLElement | null>(null)
const problem = ref<PageProblem | null>(null)
const still = ref<string | null>(null)
const banner = ref(emptyBannerState())
const bannerView = computed(() => visibleBanner(banner.value))
const showAddresses = ref(false)

const stopBlocked = window.ryte.page.onBlocked((report) => {
  banner.value = receiveReport(banner.value, report)
})

const openFailed = ref(false)

// The page runs without the lock there, so this is only ever a button the person presses.
async function openInBrowser(): Promise<void> {
  openFailed.value = false
  try {
    const { opened } = props.url
      ? await window.ryte.localhost.openInBrowser({ url: props.url })
      : await window.ryte.page.openInBrowser({ path: props.path ?? '' })
    openFailed.value = !opened
  } catch {
    openFailed.value = true
  }
}

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
  const { status } = props.url
    ? await window.ryte.localhost.show({ url: props.url, bounds })
    : await window.ryte.page.show({ path: props.path ?? '', bounds })
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

// Closes this tab's view, shown or hidden, and forgets its page.
function closeView(): Promise<void> {
  return props.url
    ? window.ryte.localhost.close({ url: props.url })
    : window.ryte.page.close({ path: props.path ?? '' })
}

// The tab is going to the background: its view is hidden and kept, so the page is as it was when the tab returns.
// A tab that is closed, renamed or deleted is cleaned up by the store, which reports the tabs that are open.
function parkView(): Promise<void> {
  return props.url
    ? window.ryte.localhost.park({ url: props.url })
    : window.ryte.page.park({ path: props.path ?? '' })
}

function reload(): void {
  enqueue(async () => {
    await closeView()
    opened = false
    if (!covered) await showPage()
  })
}

function syncBounds(): void {
  if (!opened || covered) return
  const bounds = currentBounds()
  if (bounds) void views.value.setBounds({ bounds }).catch(() => undefined)
}

function syncOverlay(): void {
  const next = isOverlayOpen(document)
  if (next === covered) return
  covered = next
  enqueue(async () => {
    if (!alive) return
    if (covered) {
      if (!opened) return
      const result = await views.value.hide()
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
  // Behind any show still waiting in the queue, so it cannot attach a view after the tab has left. If the person
  // has come back to this page by then (a quick A, B, A), the newer tab shows it and a park would hide it. A frame
  // later, so the show of the tab that replaces this one reaches the main process first and the stage is never
  // left empty; a timer covers a window that draws no frames.
  let parked = false
  const parkAfterFrame = (): void => {
    if (parked) return
    parked = true
    enqueue(async () => {
      const backAgain = props.url ? viewer.addressUrl === props.url : viewer.pagePath === props.path
      if (backAgain) return
      await parkView().catch(() => undefined)
    })
  }
  window.requestAnimationFrame(parkAfterFrame)
  window.setTimeout(parkAfterFrame, 100)
})

watch(() => viewer.pageVersion, reload)
// An address that needed approval shows its page once the person allows it.
watch(
  () => local.openedVersion,
  () => {
    if (props.url && problem.value === 'needs-approval') reload()
  }
)
</script>

<template>
  <div class="page-tab">
    <header class="page-caption">
      <span class="page-name">{{ name }}</span>
      <StButton
        v-if="!problem"
        variant="secondary"
        size="sm"
        class="page-open"
        data-page-open-browser
        @click="openInBrowser"
      >
        {{ openFailed ? "Couldn't open it" : 'Open in browser' }}
      </StButton>
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
    <p v-if="problem" class="page-problem">
      {{ describePageProblem(problem, path ?? name) }}
      <StButton
        v-if="url && problem === 'needs-approval'"
        variant="secondary"
        size="sm"
        data-local-allow
        @click="local.ask(url)"
      >
        Allow…
      </StButton>
    </p>
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

.page-open {
  margin-left: auto;
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
