<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { useDocumentTitles } from '../composables/useDocumentTitles'
import { useRenderedAnswer } from '../composables/useRenderedAnswer'
import { useSearchPresentation } from '../composables/useSearchPresentation'
import { render } from '../markdown/renderer'
import { useSearchStore } from '../stores/search'
import { recentSearches, type HistoryEntry } from '../stores/search-history'
import { useSettingsStore } from '../stores/settings'
import { useWorkspaceStore } from '../stores/workspace'
import { buildAnswerClipboard } from './answer-clipboard'
import { buildCitedSources, renumberMarkdown } from './cited-sources'
import { newestSourcePaths } from './research-trace-model'
import {
  buildSearchResults,
  documentTitle,
  historyOptionId,
  sourceFileName,
  sourceFolder
} from './search-result-model'
import StDialog from '../stencil/components/StDialog.vue'
import StButton from '../stencil/components/StButton.vue'
import StIconButton from '../stencil/components/StIconButton.vue'
import StInput from '../stencil/components/StInput.vue'
import StNotice from '../stencil/components/StNotice.vue'
import StStack from '../stencil/components/StStack.vue'
import StText from '../stencil/components/StText.vue'
import StIcon from '../stencil/icons/StIcon.vue'
import SearchAnswer from './SearchAnswer.vue'
import SearchFreshnessNotice from './SearchFreshnessNotice.vue'
import SearchHistoryList from './SearchHistoryList.vue'
import SearchResearchTrace from './SearchResearchTrace.vue'
import SearchSources from './SearchSources.vue'
import { summaryView } from './summary-view'
import type { SearchQueryOptions, SearchRetrievalMode } from '../../../preload/index'

const emit = defineEmits<{ close: []; openSettings: [] }>()

const SUMMARY_UPSELL_STORAGE_KEY = 'ryte.search.summary-upsell-dismissed'
const PROVIDER_SETUP_NOTICE_STORAGE_KEY = 'ryte.search.provider-setup-notice-dismissed.v1'
const HISTORY_LIST_ID = 'search-history-list'

const search = useSearchStore()
const settings = useSettingsStore()
const workspace = useWorkspaceStore()
const inputRef = ref<InstanceType<typeof StInput> | null>(null)
const localQuery = ref('')
const pendingCloudQuery = ref('')
const showCloudWarning = ref(false)
const retrievalMode = ref<SearchRetrievalMode>('auto')
const providerSetupNoticeDismissed = ref(loadProviderSetupNoticeDismissal())
const summaryUpsellDismissed = ref(loadDismissal(SUMMARY_UPSELL_STORAGE_KEY))
const activeHistoryIndex = ref(0)
const linkedCitation = ref<number | null>(null)
const copyState = ref<'idle' | 'copied' | 'failed'>('idle')
const lastRunLocalOnly = ref(false)
const resultsOpen = ref(false)
const panelRef = ref<HTMLElement | null>(null)
let copyResetTimer: number | undefined
// Set by Update summary so its run keeps the old summary visible; the store only honours it for the
// same query.
let keepSummaryOnUpdate = false

const isRunning = computed(() => search.status === 'searching' || search.status === 'streaming')
const expanded = computed(() => search.status !== 'idle' || !!search.answer)
const searchResults = computed(() => buildSearchResults(search.sources, search.citations))

// Titles are read from the notes themselves: for the newest notes mentioned while thinking, and for
// the results list once it is opened.
const titlePaths = computed(() => [
  ...newestSourcePaths(search.sources, 2),
  ...search.citations.map((citation) => citation.sourcePath),
  ...(resultsOpen.value ? searchResults.value.map((result) => result.sourcePath) : [])
])
const titles = useDocumentTitles(titlePaths)

const presentation = useSearchPresentation(search, titles)
const {
  phase,
  working,
  traceLines,
  thoughtLabel,
  typing,
  writing,
  displayedAnswer,
  citedSources,
  numbers,
  resultsOpenByDefault
} = presentation

// An update keeps the old summary on screen until the new one starts writing.
const view = computed(() =>
  summaryView(search.previousSummary, {
    answer: displayedAnswer.value,
    citations: search.citations,
    numbers: numbers.value,
    sources: citedSources.value,
    typing: typing.value,
    writing: writing.value
  })
)

const { renderedAnswer, hasAnswer } = useRenderedAnswer({
  answer: computed(() => view.value.answer),
  citations: computed(() => view.value.citations),
  numbers: computed(() => view.value.numbers),
  typing: computed(() => view.value.typing),
  writing: computed(() => view.value.writing)
})

const recent = computed(() => recentSearches(search.history))
const showHistory = computed(() => !expanded.value && localQuery.value.trim().length === 0)
const showSearchResults = computed(
  () => searchResults.value.length > 0 && phase.value === 'settled'
)
const hasConfiguredAnswerProvider = computed(() => {
  if (!settings.state) return false
  return settings.state.answerProvider === 'anthropic'
    ? settings.state.hasAnthropicKey
    : settings.state.hasOpenAIKey
})
const canGenerateAnswer = computed(
  () => settings.state?.cloudAnswersEnabled === true && hasConfiguredAnswerProvider.value
)
const showProviderSetupNotice = computed(
  () =>
    settings.state?.cloudAnswersEnabled === true &&
    !hasConfiguredAnswerProvider.value &&
    !providerSetupNoticeDismissed.value
)
// With Cloud Answers off, a search is just its results; the summary is offered, not reported missing.
const cloudAnswersOff = computed(() => settings.state?.cloudAnswersEnabled === false)
const showSummaryUpsell = computed(() => cloudAnswersOff.value && !summaryUpsellDismissed.value)
const visibleNotices = computed(() =>
  search.notices.filter(
    (notice) => notice.code !== 'provider-key-missing' && notice.code !== 'cloud-answers-disabled'
  )
)
const sourcesPending = computed(
  () =>
    (phase.value === 'thinking' || phase.value === 'answering') &&
    canGenerateAnswer.value &&
    !lastRunLocalOnly.value &&
    !view.value.holding
)
const showSources = computed(() => view.value.sources.length > 0 || sourcesPending.value)
const showFreshnessNotice = computed(
  () => search.freshness.state === 'updates-available' && search.generatedAt !== null
)
const showTrace = computed(
  () => !cloudAnswersOff.value && phase.value !== 'idle' && traceLines.value.length > 0
)
// Results-only searches have no trace or summary, so the block is hidden to avoid a blank gap.
const showSummaryBlock = computed(
  () => showTrace.value || hasAnswer.value || (search.status === 'error' && !!search.error)
)
const showAnswerActions = computed(
  () => phase.value === 'settled' && search.status === 'done' && hasAnswer.value
)
const activeOptionId = computed(() =>
  showHistory.value && recent.value.length > 0
    ? historyOptionId(HISTORY_LIST_ID, activeHistoryIndex.value)
    : undefined
)
function resultTitle(sourcePath: string): string {
  return titles.value[sourcePath] ?? documentTitle(sourcePath)
}

const resultsHeading = computed(
  () => `${searchResults.value.length} Result${searchResults.value.length === 1 ? '' : 's'}`
)

watch(
  () => recent.value.length,
  (length) => {
    activeHistoryIndex.value = Math.min(activeHistoryIndex.value, Math.max(0, length - 1))
  }
)

watch(
  () => true,
  async () => {
    await nextTick()
    inputRef.value?.focus()
  },
  { immediate: true }
)

watch(
  () => search.status,
  (status) => {
    if (status === 'searching') resultsOpen.value = false
  }
)

// With no summary the results are the whole answer, so they start open.
watch(resultsOpenByDefault, (open) => {
  if (open) resultsOpen.value = true
})

// The panel grows out of the idle input into the work surface instead of jumping to it.
watch(
  expanded,
  async (isExpanded) => {
    const panel = panelRef.value
    if (!isExpanded || !panel || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    const from = panel.getBoundingClientRect()
    await nextTick()
    const to = panel.getBoundingClientRect()
    panel.animate(
      [
        { width: `${from.width}px`, height: `${from.height}px` },
        { width: `${to.width}px`, height: `${to.height}px` }
      ],
      { duration: 460, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    )
  },
  { flush: 'sync' }
)

onBeforeUnmount(() => window.clearTimeout(copyResetTimer))

function onInputKeydown(e: KeyboardEvent): void {
  if (!showHistory.value || recent.value.length === 0) return
  const count = recent.value.length
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeHistoryIndex.value = (activeHistoryIndex.value + 1) % count
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeHistoryIndex.value = (activeHistoryIndex.value - 1 + count) % count
  }
}

async function onEnter(): Promise<void> {
  const entry = recent.value[activeHistoryIndex.value]
  if (showHistory.value && entry) {
    await openHistoryEntry(entry)
    return
  }
  await submit()
}

async function submit(): Promise<void> {
  if (!localQuery.value.trim() || isRunning.value) return
  if (!settings.state) await settings.hydrate()
  const q = localQuery.value.trim()
  if (settings.state?.cloudAnswersEnabled && !hasCurrentCloudAcknowledgement()) {
    pendingCloudQuery.value = q
    showCloudWarning.value = true
    return
  }
  await runSearch(q)
}

async function continueWithCloud(): Promise<void> {
  const q = pendingCloudQuery.value
  if (!q) return
  if (!settings.state) return
  await settings.save({
    cloudAnswersAcknowledgement: {
      acknowledgedAt: new Date().toISOString(),
      provider: settings.state.answerProvider,
      model: settings.state.answerModel
    }
  })
  showCloudWarning.value = false
  pendingCloudQuery.value = ''
  await runSearch(q)
}

async function searchLocallyOnly(): Promise<void> {
  const q = pendingCloudQuery.value
  if (!q) return
  showCloudWarning.value = false
  pendingCloudQuery.value = ''
  await runSearch(q, 'local-only')
}

function loadDismissal(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

function loadProviderSetupNoticeDismissal(): boolean {
  return loadDismissal(PROVIDER_SETUP_NOTICE_STORAGE_KEY)
}

function saveDismissal(key: string): void {
  try {
    window.localStorage.setItem(key, 'true')
  } catch {
    // The notice remains dismissed for this session if local storage is unavailable.
  }
}

function dismissProviderSetupNotice(): void {
  providerSetupNoticeDismissed.value = true
  saveDismissal(PROVIDER_SETUP_NOTICE_STORAGE_KEY)
}

function dismissSummaryUpsell(): void {
  summaryUpsellDismissed.value = true
  saveDismissal(SUMMARY_UPSELL_STORAGE_KEY)
}

/** A saved snapshot restores exactly as it was; a query-only row runs a new local search. */
async function openHistoryEntry(entry: HistoryEntry): Promise<void> {
  localQuery.value = entry.query
  retrievalMode.value = entry.retrievalMode === 'keyword' ? 'keyword' : 'auto'
  showCloudWarning.value = false
  if (search.restoreSnapshot(entry)) return
  await submit()
}

/** Reruns retrieval and generation; the saved snapshot is replaced only when the run completes. */
async function updateSummary(): Promise<void> {
  if (!search.query || isRunning.value || !canGenerateAnswer.value) return
  localQuery.value = search.query
  keepSummaryOnUpdate = true
  await submit()
}

/** The mode only affects retrieval, so changing it searches the current query again. */
async function rerunWithMode(): Promise<void> {
  if (!search.query) return
  localQuery.value = search.query
  await submit()
}

function openCitation(sourcePath: string): void {
  void workspace.openOrFocusFile({ sourcePath })
  void closeOverlay()
}

function openSourceByNumber(number: number): void {
  const source = view.value.sources.find((item) => item.number === number)
  if (source) openCitation(source.sourcePath)
}

async function copyAnswer(): Promise<void> {
  window.clearTimeout(copyResetTimer)
  try {
    const numbered = renumberMarkdown(search.answer, search.citations)
    const { markdown, html } = buildAnswerClipboard(
      numbered,
      buildCitedSources(search.answer, search.citations),
      await render(numbered)
    )
    if (typeof ClipboardItem === 'undefined') {
      await navigator.clipboard.writeText(markdown)
    } else {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([markdown], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' })
        })
      ])
    }
    copyState.value = 'copied'
  } catch {
    copyState.value = 'failed'
  }
  copyResetTimer = window.setTimeout(() => (copyState.value = 'idle'), 2000)
}

async function runSearch(
  query: string,
  answerMode?: SearchQueryOptions['answerMode']
): Promise<void> {
  lastRunLocalOnly.value = answerMode === 'local-only'
  linkedCitation.value = null
  const keepPrevious = keepSummaryOnUpdate
  keepSummaryOnUpdate = false
  await search.runQuery(query, searchOptions(answerMode), {
    answerModel: settings.state?.answerModel ?? null,
    keepPrevious
  })
}

function searchOptions(answerMode?: SearchQueryOptions['answerMode']): SearchQueryOptions {
  return answerMode
    ? { retrievalMode: retrievalMode.value, answerMode }
    : { retrievalMode: retrievalMode.value }
}

function hasCurrentCloudAcknowledgement(): boolean {
  const s = settings.state
  return (
    !!s?.cloudAnswersAcknowledgement &&
    s.cloudAnswersAcknowledgement.provider === s.answerProvider &&
    s.cloudAnswersAcknowledgement.model === s.answerModel
  )
}

async function closeOverlay(): Promise<void> {
  if (isRunning.value) {
    await search.cancel()
  }
  emit('close')
}
</script>

<template>
  <StDialog class="search-dialog" label="Search notes" @dismiss="closeOverlay">
    <div class="search-backdrop" :class="{ expanded }" @click.self="closeOverlay">
      <div ref="panelRef" class="search-panel">
        <header class="search-header">
          <div class="search-input-row">
            <span class="search-icon" aria-hidden="true"><StIcon name="search" :size="18" /></span>
            <StInput
              ref="inputRef"
              v-model="localQuery"
              variant="bare"
              size="lg"
              class="search-input"
              role="combobox"
              label="Search your notes"
              aria-autocomplete="none"
              :aria-expanded="showHistory && recent.length > 0"
              :aria-controls="HISTORY_LIST_ID"
              :aria-activedescendant="activeOptionId"
              placeholder="Search your notes"
              spellcheck="false"
              @keydown="onInputKeydown"
              @keydown.enter.prevent="onEnter"
            />
            <StIconButton
              v-if="expanded"
              icon="close"
              label="Close search"
              size="lg"
              @click="closeOverlay"
            />
          </div>

          <StNotice
            v-if="showCloudWarning"
            tone="warning"
            class="cloud-warning"
            role="alertdialog"
            aria-live="assertive"
          >
            This is the first time Ryte will send note content outside your Mac. Ryte will send this
            query and selected matching excerpts to your configured model provider. Local keyword
            search remains available without sending data.
            <template #actions>
              <StButton @click="searchLocallyOnly">Search locally</StButton>
              <StButton variant="primary" @click="continueWithCloud">Continue</StButton>
            </template>
          </StNotice>
        </header>

        <main class="search-body ryte-scrollbar ryte-scrollbar--y" aria-label="Search content">
          <SearchHistoryList
            v-if="showHistory"
            :entries="recent"
            :active-index="activeHistoryIndex"
            :list-id="HISTORY_LIST_ID"
            @select="openHistoryEntry"
            @hover="activeHistoryIndex = $event"
            @clear="search.clearHistory"
          />
          <p v-else-if="!expanded" class="search-hint">Press Enter to search your notes.</p>

          <div v-else class="search-grid" :class="{ 'with-sources': showSources }">
            <StStack :gap="100" class="search-main">
              <StNotice
                v-if="showSummaryUpsell"
                dismissible
                :title="
                  hasConfiguredAnswerProvider
                    ? 'Get an answer, not just a list'
                    : 'Ask your notes, get an answer'
                "
                @dismiss="dismissSummaryUpsell"
              >
                <template v-if="hasConfiguredAnswerProvider">
                  Turn on summaries and Ryte reads your best matches, then writes a cited answer.
                  Only this query and short excerpts are sent. Your full notes stay on your Mac.
                </template>
                <template v-else>
                  Add an OpenAI or Anthropic API key and Ryte reads your best matches, then writes a
                  cited answer. Until then, search stays on your Mac.
                </template>
                <template #actions>
                  <StButton variant="primary" size="sm" @click="emit('openSettings')">
                    {{ hasConfiguredAnswerProvider ? 'Turn on summaries' : 'Add an API key' }}
                  </StButton>
                </template>
              </StNotice>

              <StStack v-if="visibleNotices.length > 0" :gap="50" aria-live="polite">
                <StNotice v-for="notice in visibleNotices" :key="notice.code" tone="warning">
                  {{ notice.message }}
                </StNotice>
              </StStack>

              <StNotice
                v-if="showProviderSetupNotice"
                dismissible
                aria-live="polite"
                @dismiss="dismissProviderSetupNotice"
              >
                No API key is set for
                {{ settings.state?.answerProvider === 'anthropic' ? 'Anthropic' : 'OpenAI' }}.
                <template #actions>
                  <StButton size="sm" @click="emit('openSettings')">Set up AI</StButton>
                </template>
              </StNotice>

              <SearchFreshnessNotice
                v-if="showFreshnessNotice"
                :generated-at="search.generatedAt as number"
                :relevant-count="search.freshness.relevantCount"
                :can-update="canGenerateAnswer"
                @update="updateSummary"
                @keep="search.keepCurrent"
              />

              <StStack :gap="100" class="search-summary" :class="{ 'is-empty': !showSummaryBlock }">
                <SearchResearchTrace
                  v-if="showTrace"
                  :thinking="working"
                  :label="thoughtLabel ?? ''"
                  :lines="traceLines"
                />

                <Transition name="answer-reveal">
                  <SearchAnswer
                    v-if="hasAnswer"
                    :class="{ 'is-updating': view.holding }"
                    :answer="renderedAnswer"
                    :linked-index="linkedCitation"
                    :busy="view.typing || view.holding"
                    @open="openSourceByNumber"
                    @activate="linkedCitation = $event"
                  />
                </Transition>

                <StNotice
                  v-if="search.status === 'error' && search.error"
                  tone="danger"
                  variant="inline"
                >
                  {{ search.error }}
                </StNotice>

                <StStack v-if="showAnswerActions" direction="row" align="center" :gap="25">
                  <StIconButton icon="copy" label="Copy answer" @click="copyAnswer" />
                  <StIconButton
                    icon="refresh"
                    label="Update summary"
                    :title="
                      canGenerateAnswer
                        ? 'Update summary'
                        : 'Set up an answer provider to update summaries'
                    "
                    :disabled="!canGenerateAnswer"
                    @click="updateSummary"
                  />
                  <span class="answer-action-status" role="status">
                    {{
                      copyState === 'copied'
                        ? 'Copied'
                        : copyState === 'failed'
                          ? 'Copy failed'
                          : ''
                    }}
                  </span>
                </StStack>
              </StStack>
            </StStack>

            <SearchSources
              v-if="showSources"
              class="search-sources"
              :class="{ 'is-updating': view.holding }"
              :sources="view.sources"
              :linked-index="linkedCitation"
              :pending="sourcesPending"
              :animate="!search.restoredSnapshotId && !view.holding"
              @open="openCitation"
              @activate="linkedCitation = $event"
            />

            <section
              v-if="showSearchResults"
              class="search-results"
              aria-labelledby="results-heading"
            >
              <div class="results-header">
                <h2 id="results-heading" class="results-heading">
                  <span v-if="cloudAnswersOff">{{ resultsHeading }}</span>
                  <button
                    v-else
                    type="button"
                    class="results-toggle"
                    :aria-expanded="resultsOpen"
                    aria-controls="search-results-list"
                    @click="resultsOpen = !resultsOpen"
                  >
                    <StIcon
                      name="chevron-right"
                      :size="12"
                      class="results-chevron"
                      :class="{ open: resultsOpen }"
                    />
                    <span>{{ resultsHeading }}</span>
                  </button>
                </h2>
                <label class="mode-control">
                  <StText size="sm" tone="tertiary">Matching</StText>
                  <span class="mode-select">
                    <select
                      v-model="retrievalMode"
                      aria-label="Search mode"
                      title="Best match uses semantic retrieval when available and falls back to keyword search. Changing it searches again."
                      :disabled="isRunning"
                      @change="rerunWithMode"
                    >
                      <option value="auto">Best match</option>
                      <option value="keyword">Keywords only</option>
                    </select>
                    <StIcon name="chevron-right" :size="12" class="mode-chevron" />
                  </span>
                </label>
              </div>
              <ul
                v-show="resultsOpen || cloudAnswersOff"
                id="search-results-list"
                class="results-list"
              >
                <li v-for="result in searchResults" :key="result.sourcePath">
                  <button type="button" class="result-row" @click="openCitation(result.sourcePath)">
                    <span class="result-title">{{ resultTitle(result.sourcePath) }}</span>
                    <span class="result-path">
                      {{ sourceFolder(result.sourcePath) }}{{ sourceFileName(result.sourcePath) }}
                    </span>
                  </button>
                </li>
              </ul>
            </section>
          </div>
        </main>
      </div>
    </div>
  </StDialog>
</template>

<style scoped>
.search-backdrop {
  /* One inset all round, deep enough to clear the macOS traffic lights at the top left. */
  --sp-inset: var(--st-space-600);
  --sp-inset-top: var(--st-space-600);
  --sp-header-height: calc(var(--st-layout-100) + var(--st-border-100));

  /* The work surface follows the app's color mode through the shared tokens. */
  --sp-text: var(--st-color-text-primary);
  --sp-text-2: var(--st-color-text-secondary);
  --sp-text-3: var(--st-color-text-tertiary);
  --sp-border: var(--st-color-border-base);
  --sp-hover: var(--st-color-surface-hover);
  --sp-link: var(--st-color-link);
  --sp-link-strong: var(--st-color-link-strong);
  --sp-link-wash: color-mix(in srgb, var(--st-color-accent) 12%, transparent);
  --sp-accent: var(--st-color-accent);
  --sp-focus: var(--st-color-focus);
  --sp-done: var(--st-color-success);
  --sp-notice-bg: color-mix(in srgb, var(--st-color-accent) 10%, transparent);
  --sp-action-subtle: var(--st-color-text-secondary);
  --sp-action-muted: var(--st-color-text-secondary);
  --sp-mono: var(--st-font-ui-mono);

  display: flex;
  align-items: flex-start;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: var(--sp-inset-top) var(--sp-inset) var(--sp-inset);
}

/* The dialog supplies the window-wide scrim; the backdrop inside it carries the inset. */
.search-dialog {
  --st-dialog-padding: 0;
}

.search-panel {
  container: search-panel / inline-size;
  display: flex;
  flex-direction: column;
  width: min(var(--st-layout-1300), 100%);
  max-height: 100%;
  overflow: hidden;
  color: var(--sp-text);
  background: var(--st-color-surface-base);
  border-radius: var(--st-space-200);
}

.expanded .search-panel {
  width: 100%;
  height: 100%;
}

.search-header {
  flex: 0 0 auto;
  border-bottom: var(--st-border-100) solid var(--sp-border);
}

.search-input-row {
  display: flex;
  align-items: center;
  gap: var(--st-space-100);
  height: var(--st-layout-100);
  padding: var(--st-space-250);
}

.search-icon {
  display: inline-flex;
  color: var(--st-color-text-primary);
}

.search-input {
  flex: 1;
}

.result-row:focus-visible {
  outline: var(--st-border-200) solid var(--sp-focus);
  outline-offset: var(--st-space-25);
}

.search-body {
  --ryte-scrollbar-track: var(--st-color-surface-sunken);
  --ryte-scrollbar-track-subtle: var(--st-color-surface-sunken);
  --ryte-scrollbar-thumb: var(--st-color-border-strong);
  --ryte-scrollbar-thumb-strong: var(--st-color-border-contrast);

  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--st-space-150) var(--st-space-125);
}

.app.scrollbars-always-visible .search-body.ryte-scrollbar::-webkit-scrollbar-thumb {
  background: var(--st-color-surface-active);
}

.search-hint {
  padding: var(--st-space-75) var(--st-space-125);
  color: var(--sp-text-3);
  font-size: var(--st-type-body-md-size);
}

/* Narrow: summary, then cited sources, then results. */
.search-grid {
  animation: grid-in 360ms ease-out 120ms both;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    'main'
    'sources'
    'results';
  gap: var(--st-space-250);
  justify-content: center;
  max-width: var(--st-layout-1200);
  margin: 0 auto;
}

.search-main {
  grid-area: main;
}

.search-summary {
  padding: 0 var(--st-space-100);
}

.search-summary.is-empty {
  display: none;
}

.search-sources {
  grid-area: sources;
}

.search-results {
  grid-area: results;
  display: flex;
  flex-direction: column;
  gap: var(--st-space-25);
  min-width: 0;
  padding-top: var(--st-space-200);
  border-top: var(--st-border-100) solid var(--st-color-border-base);
}

/* Wide: answer and results on the left, cited sources sticky on the right. */
@container search-panel (min-width: 920px) {
  .search-grid.with-sources {
    grid-template-columns: minmax(0, var(--st-layout-1200)) minmax(0, var(--st-layout-600));
    grid-template-areas:
      'main sources'
      'results sources';
    column-gap: var(--st-space-400);
    max-width: none;
  }

  .search-grid.with-sources .search-sources {
    position: sticky;
    top: 0;
    align-self: start;
    max-height: calc(
      100vh - var(--sp-inset-top) - var(--sp-inset) - var(--sp-header-height) - var(--st-block-300)
    );
    overflow-y: auto;
  }
}

.cloud-warning {
  margin: 0 var(--st-space-250) var(--st-space-200);
}

.answer-action-status {
  margin-left: var(--st-space-75);
  color: var(--sp-text-3);
  font-size: var(--st-type-body-sm-size);
}

.results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--st-space-150);
  padding: var(--st-space-25) var(--st-space-100);
}

.mode-control {
  display: inline-flex;
  align-items: baseline;
}

.mode-select {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.mode-select select {
  field-sizing: content;
  padding: var(--st-space-50) var(--st-space-250) var(--st-space-50) var(--st-space-50);
  color: var(--sp-link);
  background: transparent;
  border: 0;
  border-radius: var(--st-space-50);
  appearance: none;
  cursor: pointer;
  font: inherit;
  font-size: var(--st-type-label-md-size);
  font-weight: var(--st-type-label-md-weight);
  line-height: var(--st-type-label-md-leading);
}

.mode-select select:hover:not(:disabled) {
  background: var(--sp-hover);
}

.mode-select select:focus-visible {
  outline: var(--st-border-200) solid var(--sp-focus);
  outline-offset: var(--st-space-1);
}

.mode-select select:disabled {
  cursor: default;
  opacity: 0.5;
}

.mode-chevron {
  position: absolute;
  right: var(--st-space-50);
  color: var(--sp-link);
  pointer-events: none;
  transform: rotate(90deg);
}

.results-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--st-space-75);
  padding: 0;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: var(--st-space-50);
  cursor: pointer;
  font: inherit;
}

.results-toggle:focus-visible {
  outline: var(--st-border-200) solid var(--sp-focus);
  outline-offset: var(--st-space-25);
}

.results-chevron {
  transition: transform 150ms ease-out;
}

.results-chevron.open {
  transform: rotate(90deg);
}

.results-heading {
  padding: 0;
  color: var(--sp-text);
  font-size: var(--st-type-label-lg-size);
  font-weight: var(--st-type-label-lg-weight);
  line-height: var(--st-type-label-lg-leading);
}

.results-list {
  display: flex;
  flex-direction: column;
  padding: 0;
}

.result-row {
  display: flex;
  flex-direction: column;
  gap: var(--st-space-50);
  width: 100%;
  padding: var(--st-space-75) var(--st-space-125);
  color: var(--sp-text);
  background: transparent;
  border: 0;
  border-radius: var(--st-space-100);
  cursor: pointer;
  font: inherit;
  line-height: var(--st-line-height-200);
  text-align: left;
}

.result-row:hover {
  background: var(--sp-hover);
}

.result-title {
  font-size: var(--st-type-label-lg-size);
  font-weight: var(--st-type-label-lg-weight);
  overflow-wrap: anywhere;
}

.result-path {
  color: var(--sp-text-3);
  font-size: var(--st-type-caption-md-size);
  overflow-wrap: anywhere;
}

@keyframes grid-in {
  from {
    opacity: 0;
  }
}

.answer-reveal-enter-active {
  transition: opacity 180ms ease-out;
}

.answer-reveal-enter-from {
  opacity: 0;
}

/* The summary an update is about to replace: still readable (5.7:1), but visibly on its way out. */
.is-updating {
  opacity: 0.6;
}

@media (max-width: 640px) {
  .search-backdrop {
    --sp-inset: var(--st-space-200);
  }
}

@media (prefers-reduced-motion: reduce) {
  .answer-reveal-enter-active,
  .search-grid {
    animation: none;
    transition: none;
  }
}
</style>
