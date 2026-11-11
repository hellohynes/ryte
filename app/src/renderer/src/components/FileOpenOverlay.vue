<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { parseTypedLocalAddress } from '../../../shared/local-address'
import { useFileCatalogStore } from '../stores/file-catalog'
import { useLocalAddressStore } from '../stores/local-address'
import { useWorkspaceStore } from '../stores/workspace'
// There is no StCombobox yet; this is the only combobox, so it uses the list behavior directly until a
// second one earns the component.
// eslint-disable-next-line no-restricted-imports
import { scrollTopToReveal, useListNavigation } from '../stencil/behaviors/list-navigation'
import StDialog from '../stencil/components/StDialog.vue'
import StInput from '../stencil/components/StInput.vue'
import StNotice from '../stencil/components/StNotice.vue'
import StIcon from '../stencil/icons/StIcon.vue'
import { resolveFileIconName } from './file-icon-resolver'
import { buildFileOpenResults, type FileOpenResult } from './file-open-model'

const emit = defineEmits<{ close: [] }>()

type OpenRow = ({ kind: 'file' } & FileOpenResult) | { kind: 'address'; url: string; label: string }

const catalog = useFileCatalogStore()
const workspace = useWorkspaceStore()
const localAddress = useLocalAddressStore()
const inputRef = ref<InstanceType<typeof StInput> | null>(null)
const resultsRef = ref<HTMLElement | null>(null)
const query = ref('')
const openingSourcePath = ref<string | null>(null)
const openError = ref<string | null>(null)
const resultsListId = 'file-open-results'

// What was typed may be a page on this Mac: its row comes first and opens a tab after the prompt.
const typedAddress = computed(() => parseTypedLocalAddress(query.value))
const fileResults = computed(() => buildFileOpenResults(catalog.files, query.value))
const results = computed<OpenRow[]>(() => [
  ...(typedAddress.value
    ? [
        {
          kind: 'address' as const,
          url: typedAddress.value.url,
          label: typedAddress.value.url.replace(/\/$/, '')
        }
      ]
    : []),
  ...fileResults.value.map((file) => ({ kind: 'file' as const, ...file }))
])
const list = useListNavigation({
  count: () => results.value.length,
  optionId: resultOptionId,
  reveal: () => void nextTick(scrollSelectedResultIntoView)
})
const selectedIndex = list.active
const selectedResult = computed(() => results.value[selectedIndex.value] ?? null)
const emptyResultsLabel = computed(() =>
  catalog.files.length === 0 ? 'No files indexed' : `No matches for "${query.value.trim()}"`
)

watch(results, (nextResults) => {
  if (selectedIndex.value >= nextResults.length) list.set(nextResults.length - 1)
})

watch(query, () => {
  list.set(0)
  openError.value = null
})

onMounted(async () => {
  await catalog.hydrate()
  await nextTick()
  inputRef.value?.focus()
})

onUnmounted(() => {
  catalog.unbind()
})

function resultOptionId(index: number): string {
  return `file-open-result-${index}`
}

function scrollSelectedResultIntoView(): void {
  const container = resultsRef.value
  const selectedItem = container?.children.item(selectedIndex.value) as HTMLElement | null
  if (!container || !selectedItem) return

  const containerRect = container.getBoundingClientRect()
  const selectedItemRect = selectedItem.getBoundingClientRect()
  const nextScrollTop = scrollTopToReveal({
    scrollTop: container.scrollTop,
    viewportHeight: container.clientHeight,
    itemTop: container.scrollTop + selectedItemRect.top - containerRect.top,
    itemHeight: selectedItemRect.height,
    margin: 6
  })

  if (nextScrollTop !== container.scrollTop) {
    container.scrollTop = nextScrollTop
  }
}

async function openResult(result: OpenRow | null): Promise<void> {
  if (openingSourcePath.value) return
  if (!result) return

  if (result.kind === 'address') {
    emit('close')
    await localAddress.ask(result.url)
    return
  }

  openError.value = null
  openingSourcePath.value = result.sourcePath

  try {
    await workspace.openExplicitFile({ sourcePath: result.sourcePath })
    emit('close')
  } catch (e) {
    openError.value = e instanceof Error ? e.message : 'Unable to open file'
  } finally {
    openingSourcePath.value = null
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (list.onKeydown(event)) return
  if (event.key === 'Enter') {
    event.preventDefault()
    void openResult(selectedResult.value)
  }
}
</script>

<template>
  <StDialog placement="top" label="Open file" @dismiss="emit('close')">
    <section class="open-panel">
      <div class="open-input-shell">
        <StInput
          ref="inputRef"
          v-model="query"
          role="combobox"
          placeholder="Open file"
          label="Open file"
          aria-autocomplete="list"
          aria-expanded="true"
          :aria-controls="results.length > 0 ? resultsListId : undefined"
          :aria-activedescendant="list.activeId.value"
          autocomplete="off"
          spellcheck="false"
          @keydown="onKeydown"
        />
      </div>

      <StNotice v-if="openError" tone="danger" variant="inline" class="open-notice">{{
        openError
      }}</StNotice>
      <div v-if="catalog.loading && results.length === 0" class="open-state">Loading files...</div>
      <StNotice v-else-if="catalog.error" tone="danger" variant="inline" class="open-notice">{{
        catalog.error
      }}</StNotice>
      <div v-else-if="results.length === 0" class="open-state">{{ emptyResultsLabel }}</div>

      <ul
        v-else
        :id="resultsListId"
        ref="resultsRef"
        class="open-results ryte-scrollbar ryte-scrollbar--y"
        role="listbox"
        aria-label="Files"
      >
        <li
          v-for="(result, index) in results"
          :id="resultOptionId(index)"
          :key="result.kind === 'address' ? result.url : result.sourcePath"
          class="open-result"
          :class="{
            selected: index === selectedIndex,
            opening: result.kind === 'file' && openingSourcePath === result.sourcePath
          }"
          role="option"
          :aria-selected="index === selectedIndex"
          :aria-disabled="openingSourcePath !== null"
          @mousedown.prevent
          @mouseenter="selectedIndex = index"
          @click="openResult(result)"
        >
          <template v-if="result.kind === 'address'">
            <StIcon name="globe" :size="12" />
            <span class="result-copy">
              <span class="result-title" data-open-address>Open {{ result.label }} in Ryte</span>
            </span>
          </template>
          <template v-else>
            <StIcon :name="resolveFileIconName(result.sourcePath)" :size="12" />
            <span class="result-copy">
              <span class="result-title">{{ result.title }}</span>
              <span class="result-path">{{ result.sourcePath }}</span>
            </span>
          </template>
        </li>
      </ul>
    </section>
  </StDialog>
</template>

<style scoped>
.open-panel {
  width: min(var(--st-layout-1000), calc(100vw - var(--st-block-600)));
  max-height: min(var(--st-layout-1050), 76vh);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border: var(--st-border-100) solid var(--st-color-border-base);
  border-radius: var(--st-space-125);
  background: var(--st-color-surface-base);
  box-shadow: var(--st-shadow-xl);
}

.open-input-shell {
  padding: var(--st-space-150);
  border-bottom: var(--st-border-100) solid var(--st-color-border-subtle);
}

.open-results {
  min-height: 0;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: var(--st-space-100);
}

.open-result {
  width: 100%;
  min-height: var(--st-block-550);
  display: flex;
  align-items: center;
  box-sizing: border-box;
  gap: var(--st-space-125);
  border: 0;
  border-radius: var(--st-space-100);
  padding: var(--st-space-100) var(--st-space-125);
  background: transparent;
  color: var(--st-color-text-secondary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.open-result.selected,
.open-result:hover,
.open-result:focus-visible {
  background: var(--st-color-surface-hover);
  color: var(--st-color-text-strong);
  outline: 0;
}

.open-result.selected {
  box-shadow: inset 0 0 0 var(--st-border-100) var(--st-color-focus);
}

.open-result.opening {
  cursor: default;
  opacity: 0.72;
}

.open-result :deep(.ryte-svg-icon) {
  width: var(--st-block-200);
  height: var(--st-block-200);
  flex: 0 0 auto;
}

.result-copy {
  min-width: 0;
  display: grid;
  gap: var(--st-space-50);
}

.result-title,
.result-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-title {
  font-size: var(--st-type-body-compact-size);
  line-height: var(--st-type-body-compact-leading);
}

.result-path {
  color: var(--st-color-text-muted);
  font-family: var(--st-type-code-sm-family);
  font-size: var(--st-type-code-sm-size);
  line-height: var(--st-type-code-sm-leading);
}

.open-state {
  padding: var(--st-space-250);
  color: var(--st-color-text-muted);
  font-size: var(--st-type-body-compact-size);
}

.open-notice {
  padding: var(--st-space-250);
}
</style>
