<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import StButton from '../../stencil/components/StButton.vue'
import StInput from '../../stencil/components/StInput.vue'
import StNotice from '../../stencil/components/StNotice.vue'
import StText from '../../stencil/components/StText.vue'
import StStack from '../../stencil/components/StStack.vue'

import { answerModels, type AnswerProviderId } from '../../../../shared/provider-registry'
import {
  answerVendors,
  canEnableSemantic,
  canGenerateSummaries,
  consentGiven,
  consentPatch,
  hasKey,
  keyRemovedPatch,
  keySavedPatch,
  semanticPatch,
  showVendorSelect,
  summariesPatch,
  summarizingVendor,
  vendorChoicePatch,
  vendorsWithKeys
} from '../../preferences/ai-tools-model'
import { formatValidatedAt } from '../../preferences/content-model'
import { usePreferenceSaves } from '../../preferences/use-preference-saves'
import { answerModelOptions, refreshOpenAIModels, settleRefresh } from '../answer-model-options'
import StIcon from '../../stencil/icons/StIcon.vue'
import PrefCheckbox from './PrefCheckbox.vue'
import PrefSelect from './PrefSelect.vue'
import type { PublicSettingsState } from '../../../../main/settings/settings-store'

const props = defineProps<{ state: PublicSettingsState }>()

const { commit, refresh } = usePreferenceSaves()

const VENDORS = answerVendors()
const ALL_MODELS = answerModels()

// A vendor's box is open while it has a key, or once the reader ticks it to add one.
const open = reactive(new Set<AnswerProviderId>(vendorsWithKeys(props.state)))
const keyDrafts = reactive<Record<string, string>>({ openai: '', anthropic: '' })
const messages = reactive<Record<string, string>>({})
const validating = ref<AnswerProviderId | null>(null)
// Bumped to redraw a control after a choice was declined or failed, so it shows the saved value.
const resync = reactive<Record<string, number>>({})
const modelMessage = ref('')
const refreshingModels = ref(false)
let modelTouched = false

watch(
  () => vendorsWithKeys(props.state),
  (keyed) =>
    keyed.forEach((id) => {
      open.add(id)
      // A key saved through Retry never passed through saveKey, so its draft is cleared here.
      keyDrafts[id] = ''
    })
)

const vendor = computed(() => summarizingVendor(props.state))
const canSummarize = computed(() => canGenerateSummaries(props.state))
const consent = computed(() => consentGiven(props.state))
const keychainOk = computed(() => props.state.keychainAvailable)

const vendorChoices = computed(() =>
  VENDORS.filter((candidate) => hasKey(props.state, candidate.id)).map((candidate) => ({
    value: candidate.id,
    label: candidate.label
  }))
)

const modelChoices = computed(() => {
  const provider = vendor.value
  if (!provider) return []
  return answerModelOptions({
    provider,
    registry: ALL_MODELS.filter((model) => model.providerId === provider),
    discovered: props.state.discoveredOpenAIModels,
    selected: props.state.answerModel
  }).map((option) => ({ value: option.id, label: option.label }))
})

function redraw(key: string): void {
  resync[key] = (resync[key] ?? 0) + 1
}

async function save(patch: Parameters<typeof commit>[0], redrawKey?: string): Promise<boolean> {
  const ok = await commit(patch)
  if (!ok && redrawKey) redraw(redrawKey)
  return ok
}

function setSummaries(on: boolean): void {
  void save(summariesPatch(on), 'summaries')
}

function setConsent(on: boolean): void {
  void save(consentPatch(props.state, on), 'consent')
}

function chooseVendor(value: string): void {
  void save(vendorChoicePatch(props.state, value as AnswerProviderId), 'vendor')
}

function chooseModel(value: string): void {
  modelTouched = true
  void save({ answerModel: value }, 'model')
}

async function setSemantic(on: boolean): Promise<void> {
  if (
    on &&
    !window.confirm(
      'Semantic search sends the text of your notes, in small pieces, to OpenAI to create ' +
        'embeddings. That happens for every note now, and again as notes change. Turn it on?'
    )
  ) {
    redraw('semantic')
    return
  }
  await save(semanticPatch(props.state, on), 'semantic')
}

function toggleVendor(id: AnswerProviderId, label: string, checked: boolean): void {
  if (checked) {
    open.add(id)
    return
  }
  if (!hasKey(props.state, id)) {
    open.delete(id)
    return
  }
  void removeKey(id, label, true)
}

async function removeKey(id: AnswerProviderId, label: string, closeBox = false): Promise<void> {
  if (!window.confirm(`Remove your saved ${label} API key from this Mac?`)) {
    redraw(`vendor-${id}`)
    return
  }
  messages[id] = ''
  if ((await save(keyRemovedPatch(props.state, id), `vendor-${id}`)) && closeBox) open.delete(id)
}

async function saveKey(id: AnswerProviderId): Promise<void> {
  const key = (keyDrafts[id] ?? '').trim()
  if (!key) return
  if (await save(keySavedPatch(props.state, id, key))) {
    keyDrafts[id] = ''
    messages[id] = 'Key saved.'
  }
}

async function validateKey(id: AnswerProviderId): Promise<void> {
  validating.value = id
  messages[id] = ''
  try {
    const result = await window.ryte.settings.validateKey(id)
    messages[id] =
      result.ok && result.validatedAt
        ? `Last validated on ${formatValidatedAt(result.validatedAt)}.`
        : (result.error ?? 'Validation failed.')
    if (result.ok) await refresh().catch(() => undefined)
  } catch (e) {
    messages[id] = e instanceof Error ? e.message : String(e)
  } finally {
    validating.value = null
  }
}

function keyStatus(id: AnswerProviderId): string {
  if (messages[id]) return messages[id]
  const validatedAt = props.state.providerKeyMetadata[id]?.lastValidatedAt
  return validatedAt ? `Last validated on ${formatValidatedAt(validatedAt)}.` : ''
}

/** Lists the model IDs the saved key may use; the key itself stays in the main process. */
async function refreshModels(): Promise<void> {
  refreshingModels.value = true
  modelMessage.value = ''
  const result = await refreshOpenAIModels(() => window.ryte.settings.listModels('openai'), {
    selected: props.state.answerModel,
    touched: modelTouched
  })
  if (!result.ok) {
    modelMessage.value = result.message
    refreshingModels.value = false
    return
  }
  // Main has remembered the list; read it back so the picker, and every later visit, shows it.
  try {
    await refresh()
  } catch (e) {
    modelMessage.value = `Found ${result.models.length} models, but Ryte could not read the list back: ${
      e instanceof Error ? e.message : String(e)
    }`
    refreshingModels.value = false
    return
  }
  const settled = settleRefresh(result, props.state.discoveredOpenAIModels, props.state.answerModel)
  if (settled.selected !== props.state.answerModel) await save({ answerModel: settled.selected })
  modelMessage.value = settled.message
  refreshingModels.value = false
}
</script>

<template>
  <div class="pf-pane">
    <StText as="h2" kind="headline" size="md" class="pf-pane-title">AI Tools</StText>

    <StNotice v-if="!keychainOk" tone="danger" class="pf-banner">
      macOS Keychain is unavailable. Unlock it and restart Ryte before saving API keys.
    </StNotice>

    <section class="pf-section" aria-labelledby="pf-summaries">
      <StStack :gap="50">
        <StText id="pf-summaries" as="h3" kind="headline" size="sm">Search Summarization</StText>
        <StText as="p" tone="primary" class="pf-desc">
          When enabled, your search query and selected note excerpts are sent to the AI vendor
          selected below. <strong>Your full notes are not sent.</strong>
        </StText>
      </StStack>
      <StStack :gap="100">
        <PrefCheckbox
          :key="`summaries-${resync.summaries ?? 0}`"
          :checked="state.cloudAnswersEnabled && canSummarize"
          :disabled="!canSummarize"
          @change="setSummaries"
        >
          Generate summaries from my notes
        </PrefCheckbox>
        <PrefCheckbox
          :key="`consent-${resync.consent ?? 0}`"
          :checked="consent"
          :disabled="!state.cloudAnswersEnabled || !canSummarize"
          @change="setConsent"
        >
          I consent to sending my search query and relevant notes to my selected vendor
        </PrefCheckbox>
        <StText v-if="!canSummarize" as="p" kind="body" size="sm" tone="muted"
          >Add a vendor API key below to turn this on.</StText
        >
      </StStack>
      <StStack v-if="showVendorSelect(state)" as="label" :gap="50" class="pf-field--narrow">
        <StText kind="label" size="md" tone="primary">Vendor that writes summaries</StText>
        <PrefSelect
          :key="`vendor-select-${resync.vendor ?? 0}`"
          :model-value="vendor ?? ''"
          :options="vendorChoices"
          label="Vendor that writes summaries"
          @update:model-value="chooseVendor"
        />
      </StStack>
    </section>

    <section class="pf-section" aria-labelledby="pf-semantic">
      <StStack :gap="50">
        <StText id="pf-semantic" as="h3" kind="headline" size="sm">Semantic Search</StText>
        <StText as="p" tone="primary" class="pf-desc">
          Find notes by meaning—not just by keywords. You must provide an OpenAI API key in order to
          use this feature. You can use an Anthropic key for search summarizations and an OpenAI key
          for semantic search.
        </StText>
      </StStack>
      <StStack :gap="100">
        <PrefCheckbox
          :key="`semantic-${resync.semantic ?? 0}`"
          :checked="state.semanticIndexEnabled && canEnableSemantic(state)"
          :disabled="!canEnableSemantic(state)"
          @change="setSemantic"
        >
          Enable semantic search
        </PrefCheckbox>
        <StText v-if="!canEnableSemantic(state)" as="p" kind="body" size="sm" tone="muted">
          Add an OpenAI API key below to turn this on.
        </StText>
      </StStack>
    </section>

    <section class="pf-section" aria-labelledby="pf-vendors">
      <StStack :gap="50">
        <StText id="pf-vendors" as="h3" kind="headline" size="sm">Vendors</StText>
        <StText as="p" tone="primary" class="pf-desc">
          To power the features above, please provide the necessary vendor API key(s).
        </StText>
      </StStack>

      <div class="pf-vendor-list">
        <div v-for="entry in VENDORS" :key="entry.id" class="pf-vendor">
          <PrefCheckbox
            :key="`vendor-${entry.id}-${resync[`vendor-${entry.id}`] ?? 0}`"
            :checked="open.has(entry.id)"
            @change="(checked) => toggleVendor(entry.id, entry.label, checked)"
          >
            {{ entry.label }}
          </PrefCheckbox>

          <div v-if="open.has(entry.id)" class="pf-vendor-body">
            <StStack :gap="50" class="pf-vendor-key">
              <StText kind="label" size="md" tone="primary">API Key</StText>
              <StInput
                v-if="!hasKey(state, entry.id)"
                v-model="keyDrafts[entry.id]"
                type="password"
                autocomplete="off"
                spellcheck="false"
                :label="`${entry.label} API key`"
                :placeholder="`Paste your ${entry.label} API key`"
                :disabled="!keychainOk"
                @change="saveKey(entry.id)"
              />
              <StInput
                v-else
                class="pf-mask"
                readonly
                model-value="••••••••••••••••••••••••••••••••"
                :label="`${entry.label} API key, saved`"
              />
              <StStack v-if="hasKey(state, entry.id)" direction="row" align="center" :gap="100">
                <StButton
                  variant="link"
                  :disabled="validating !== null"
                  @click="validateKey(entry.id)"
                >
                  {{ validating === entry.id ? 'Validating…' : 'Validate key' }}
                </StButton>
                <StButton variant="danger" @click="removeKey(entry.id, entry.label)">
                  Remove key
                </StButton>
              </StStack>
              <StText
                v-if="hasKey(state, entry.id) && keyStatus(entry.id)"
                as="p"
                kind="body"
                size="sm"
                tone="muted"
                role="status"
              >
                {{ keyStatus(entry.id) }}
              </StText>
              <p v-else-if="hasKey(state, entry.id)" class="pf-status pf-status--ok">
                <StIcon name="check" :size="12" aria-hidden="true" /> Key set
              </p>
              <StText
                v-else-if="messages[entry.id]"
                as="p"
                kind="body"
                size="sm"
                tone="muted"
                role="status"
              >
                {{ messages[entry.id] }}
              </StText>
              <StText v-else as="p" kind="body" size="sm" tone="muted"
                >Stored encrypted in your macOS Keychain.</StText
              >
            </StStack>

            <StStack
              v-if="vendor === entry.id && hasKey(state, entry.id)"
              :gap="50"
              class="pf-vendor-model"
            >
              <StText kind="label" size="md" tone="primary">Model</StText>
              <PrefSelect
                :key="`model-${resync.model ?? 0}`"
                :model-value="state.answerModel"
                :options="modelChoices"
                label="Answer model"
                @update:model-value="chooseModel"
              />
              <StStack v-if="entry.id === 'openai'" direction="row" align="center" :gap="100">
                <StButton variant="link" :disabled="refreshingModels" @click="refreshModels">
                  {{ refreshingModels ? 'Refreshing…' : 'Refresh models' }}
                </StButton>
              </StStack>
              <StText v-if="modelMessage" as="p" kind="body" size="sm" tone="muted" role="status">{{
                modelMessage
              }}</StText>
            </StStack>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.pf-field--narrow {
  width: var(--st-layout-400);
  max-width: 100%;
}

.pf-vendor-list {
  display: flex;
  flex-direction: column;
  gap: var(--st-space-200);
}

.pf-vendor {
  display: flex;
  flex-direction: column;
  gap: var(--st-space-100);
}

.pf-vendor-body {
  display: flex;
  flex-wrap: wrap;
  gap: var(--st-space-100);
  padding-left: var(--st-space-300);
}

.pf-vendor-key {
  flex: 1 1 var(--st-layout-400);
  max-width: var(--st-layout-600);
}

.pf-vendor-model {
  flex: 0 0 var(--st-layout-250);
}

.pf-status :deep(svg) {
  width: var(--st-block-150);
  height: var(--st-block-150);
}
</style>
