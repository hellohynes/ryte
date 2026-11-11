<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import StButton from '../../stencil/components/StButton.vue'
import StNotice from '../../stencil/components/StNotice.vue'
import StText from '../../stencil/components/StText.vue'
import StStack from '../../stencil/components/StStack.vue'

import { describeOrigin } from '../../../../shared/local-address'
import { RETENTION_OPTIONS, indexSummary } from '../../preferences/content-model'
import { clearAndRebuildConfirm, embeddingLine } from '../../preferences/embedding-model'
import { usePreferenceSaves } from '../../preferences/use-preference-saves'
import { useEmbeddingStatusStore } from '../../stores/embedding-status'
import { useIndexStatusStore } from '../../stores/index-status'
import { useSearchStore } from '../../stores/search'
import PrefCheckbox from './PrefCheckbox.vue'
import PrefSelect from './PrefSelect.vue'
import type {
  PublicSettingsState,
  SearchHistoryRetention
} from '../../../../main/settings/settings-store'

const props = defineProps<{ state: PublicSettingsState }>()

const { commit } = usePreferenceSaves()
const indexStatus = useIndexStatusStore()
const embeddingStatus = useEmbeddingStatusStore()
const search = useSearchStore()
const localError = ref<string | null>(null)

const summary = computed(() => indexSummary(indexStatus.status))
const indexBusy = computed(() => summary.value.state === 'busy')
const smartSearchLine = computed(() =>
  embeddingLine(embeddingStatus.status, props.state.semanticIndexEnabled)
)
const hasHistory = computed(() => search.history.length > 0)

// The local addresses allowed with "Always allow". Removing one makes the next open ask again.
const allowedAddresses = ref<string[]>([])

onMounted(async () => {
  try {
    allowedAddresses.value = await window.ryte.localhost.listApprovals()
  } catch (e) {
    localError.value = e instanceof Error ? e.message : String(e)
  }
})

async function removeAddress(origin: string): Promise<void> {
  localError.value = null
  try {
    allowedAddresses.value = await window.ryte.localhost.removeApproval({ origin })
  } catch (e) {
    localError.value = e instanceof Error ? e.message : String(e)
  }
}

async function chooseLocation(): Promise<void> {
  const picked = await window.ryte.dialog.openFolder()
  if (picked && picked !== props.state.notesRoot) await commit({ notesRoot: picked })
}

function setRetention(value: string): void {
  void commit({ searchHistoryRetention: value as SearchHistoryRetention })
}

function setKeepSummaries(on: boolean): void {
  void commit({ searchHistoryIncludesAnswers: on })
}

async function rebuildIndex(): Promise<void> {
  localError.value = null
  try {
    await indexStatus.triggerReindex()
  } catch (e) {
    localError.value = e instanceof Error ? e.message : String(e)
  }
}

async function clearAndRebuildIndex(): Promise<void> {
  if (!window.confirm(clearAndRebuildConfirm(props.state.semanticIndexEnabled))) {
    return
  }
  localError.value = null
  try {
    await indexStatus.clearAndRebuild()
  } catch (e) {
    localError.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <div class="pf-pane">
    <StText as="h2" kind="headline" size="md" class="pf-pane-title">Content</StText>

    <section class="pf-section" aria-labelledby="pf-location">
      <StStack :gap="50">
        <StText id="pf-location" as="h3" kind="headline" size="sm">Location</StText>
        <StText as="p" tone="primary" class="pf-desc"
          >Select the folder where Ryte files should be stored.</StText
        >
      </StStack>
      <div class="pf-box">
        <span v-if="state.notesRoot" class="pf-box-path" :title="state.notesRoot">
          {{ state.notesRoot }}
        </span>
        <span v-else>No location set</span>
        <StButton variant="primary" @click="chooseLocation">Choose location</StButton>
      </div>
      <StStack v-if="summary.state !== 'none'" :gap="100">
        <StStack v-if="summary.state !== 'error'" direction="row" align="center" :gap="100">
          <StButton variant="link" :disabled="indexBusy" @click="rebuildIndex">
            Rebuild index
          </StButton>
          <StButton variant="danger" :disabled="indexBusy" @click="clearAndRebuildIndex">
            Clear and rebuild index
          </StButton>
        </StStack>
        <StText
          as="p"
          kind="body"
          size="sm"
          tone="muted"
          :class="{ 'pf-error-inline': summary.state === 'error' }"
          role="status"
        >
          {{ summary.text }}
        </StText>
        <!-- The counts change twice a second while it works; only a change of state is worth a screen reader's voice. -->
        <StText
          v-if="smartSearchLine"
          as="p"
          kind="body"
          size="sm"
          tone="muted"
          role="status"
          :aria-live="embeddingStatus.status?.state === 'running' ? 'off' : 'polite'"
        >
          {{ smartSearchLine }}
        </StText>
      </StStack>
    </section>

    <section class="pf-section" aria-labelledby="pf-search">
      <StStack :gap="50">
        <StText id="pf-search" as="h3" kind="headline" size="sm">Search</StText>
        <StText as="p" tone="primary" class="pf-desc"
          >Determine how long your search history should be kept</StText
        >
      </StStack>
      <StStack :gap="50" class="pf-field--narrow">
        <PrefSelect
          :model-value="state.searchHistoryRetention"
          :options="RETENTION_OPTIONS"
          label="How long search history is kept"
          @update:model-value="setRetention"
        />
      </StStack>
      <PrefCheckbox
        :checked="state.searchHistoryIncludesAnswers"
        :disabled="state.searchHistoryRetention === 'off'"
        @change="setKeepSummaries"
      >
        Keep generated summaries with my history, so a past search reopens instantly
      </PrefCheckbox>
      <StStack v-if="hasHistory" direction="row" align="center" :gap="100">
        <StButton variant="danger" @click="search.clearHistory">Clear search history</StButton>
      </StStack>
    </section>

    <section class="pf-section" aria-labelledby="pf-local-pages" data-pf-local-pages>
      <StStack :gap="50">
        <StText id="pf-local-pages" as="h3" kind="headline" size="sm">Local pages</StText>
        <StText as="p" tone="primary" class="pf-desc"
          >Pages from this Mac that Ryte opens without asking. Remove one and Ryte asks
          again.</StText
        >
      </StStack>
      <StText v-if="allowedAddresses.length === 0" as="p" kind="body" size="sm" tone="muted">
        No addresses are allowed yet.
      </StText>
      <ul v-else class="pf-address-list">
        <li v-for="origin in allowedAddresses" :key="origin" class="pf-address-row">
          <StText kind="code" size="sm">{{ describeOrigin(origin) }}</StText>
          <StButton
            variant="link"
            size="sm"
            :aria-label="`Remove ${describeOrigin(origin)}`"
            data-pf-remove-address
            @click="removeAddress(origin)"
          >
            Remove
          </StButton>
        </li>
      </ul>
    </section>

    <StNotice v-if="localError" tone="danger" variant="inline" class="pf-error">{{
      localError
    }}</StNotice>
  </div>
</template>

<style scoped>
.pf-field--narrow {
  width: var(--st-layout-400);
  max-width: 100%;
}

.pf-error-inline {
  color: var(--st-color-danger);
}

.pf-address-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--st-space-50);
}

.pf-address-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--st-space-200);
}
</style>
