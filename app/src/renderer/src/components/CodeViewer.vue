<script setup lang="ts">
/** The tab for a code file: the file as written in a read-only code view, with a notice or a box when it can't be shown plainly. */
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { codeLanguageOf } from '../../../shared/code-files'
import { useViewerStore } from '../stores/viewer'
import StButton from '../stencil/components/StButton.vue'
import StNotice from '../stencil/components/StNotice.vue'
import { openCodeEditor, type CodeEditorHandle } from './code-editor'
import {
  CODE_VIEW_NOTICE_TEXT,
  describeCodeProblem,
  formatCodeFileSize,
  prepareCodeView
} from './code-view-model'

const props = defineProps<{
  /** The file's path relative to the notes folder. */
  path: string
}>()

const viewer = useViewerStore()

const name = computed(() => props.path.slice(props.path.lastIndexOf('/') + 1))
const file = computed(() => viewer.codeFile)
const prepared = computed(() =>
  file.value?.status === 'ok' ? prepareCodeView(codeLanguageOf(props.path), file.value.text) : null
)
const problem = computed(() =>
  file.value && file.value.status !== 'ok' ? describeCodeProblem(file.value, props.path) : null
)
const details = computed(() =>
  file.value?.status === 'ok' ? formatCodeFileSize(file.value.bytes) : ''
)

const host = ref<HTMLElement | null>(null)
const loadFailed = ref(false)
const openFailed = ref(false)
const foldAllUnavailable = ref(false)
let handle: CodeEditorHandle | null = null
let mountId = 0

function closeEditor(): void {
  mountId += 1
  handle?.destroy()
  handle = null
}

// The host exists only while there is text to show, so a new host means a new view.
watch(
  host,
  async (element) => {
    closeEditor()
    const view = prepared.value
    if (!element || !view) return
    const id = mountId
    loadFailed.value = false
    try {
      const opened = await openCodeEditor(element, {
        text: view.text,
        language: view.language,
        label: name.value,
        onFoldAllUnavailable: () => {
          foldAllUnavailable.value = true
        }
      })
      if (id !== mountId) opened.destroy()
      else handle = opened
    } catch {
      if (id === mountId) loadFailed.value = true
    }
  },
  { flush: 'post' }
)

onBeforeUnmount(closeEditor)

async function openInDefaultApp(): Promise<void> {
  openFailed.value = false
  try {
    const { opened } = await window.ryte.code.openInDefaultApp({ path: props.path })
    openFailed.value = !opened
  } catch {
    openFailed.value = true
  }
}
</script>

<template>
  <div class="code-tab">
    <header class="code-caption">
      <span class="code-name">{{ name }}</span>
      <span v-if="details" class="code-details">{{ details }}</span>
    </header>
    <StNotice v-if="prepared?.notice" tone="info" variant="inline" class="code-notice">
      {{ CODE_VIEW_NOTICE_TEXT[prepared.notice] }}
    </StNotice>
    <StNotice
      v-if="foldAllUnavailable"
      tone="info"
      variant="inline"
      dismissible
      class="code-notice"
      data-code-fold-notice
      @dismiss="foldAllUnavailable = false"
    >
      Fold all works only on smaller files. Use the fold arrows.
    </StNotice>
    <div v-if="viewer.error" class="code-status">
      <p>
        Could not open <code>{{ viewer.displayPath }}</code>
      </p>
      <p class="code-status-detail">{{ viewer.error }}</p>
    </div>
    <p v-else-if="!file" class="code-status">Loading…</p>
    <div v-else-if="problem" class="st-prose code-problem">
      <span class="note-picture-notice" :data-note-picture-notice="file.status">
        <span class="note-picture-notice-detail">{{ problem.detail }}</span>
        <StButton
          v-if="problem.canOpen"
          class="note-picture-open"
          variant="secondary"
          size="sm"
          @click="openInDefaultApp"
        >
          {{ openFailed ? "Couldn't open it" : 'Open in default app' }}
        </StButton>
      </span>
    </div>
    <p v-else-if="loadFailed" class="code-status">Ryte couldn't load the code view.</p>
    <div v-else ref="host" class="code-host"></div>
  </div>
</template>

<style scoped>
.code-tab {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--st-space-100);
  padding: var(--st-space-300) 0 0;
}

.code-caption {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--st-space-100) var(--st-space-200);
  padding: 0 var(--st-space-400);
}

.code-name {
  font: var(--st-type-label-md);
  color: var(--st-color-text-primary);
  overflow-wrap: anywhere;
}

.code-details {
  font-size: var(--st-type-body-sm-size);
  line-height: var(--st-type-body-sm-leading);
  color: var(--st-color-text-muted);
}

.code-notice {
  margin: 0 var(--st-space-400);
}

.code-status {
  margin: 0;
  padding: var(--st-space-200) var(--st-space-400);
  color: var(--st-color-text-muted);
}

.code-status-detail {
  margin: 0;
  overflow-wrap: anywhere;
}

.code-problem {
  padding: 0 var(--st-space-400);
}

.code-host {
  flex: 1;
  min-height: 0;
}
</style>
