import {
  PROVIDERS,
  answerModelBelongsToProvider,
  defaultAnswerModelForProvider,
  isAnswerProviderId,
  type AnswerProviderId,
  type ProviderId
} from '../../../shared/provider-registry'
import { acknowledgementForSave, acknowledgementMatches } from '../settings-acknowledgement'
import type { PublicSettingsState, SettingsUpdate } from '../../../main/settings/settings-store'

/**
 * The rules behind the AI Tools pane, kept apart from the markup so each change a control makes is
 * one small patch to save, and the cases (no key, one key, two keys, a key removed) are testable.
 */
export type SettingsPatch = SettingsUpdate

const EMBEDDING_MODEL = 'text-embedding-3-small'

export interface Vendor {
  id: AnswerProviderId
  label: string
}

/** Vendors that can write summaries, as the provider registry lists them. */
export function answerVendors(): Vendor[] {
  return PROVIDERS.filter(
    (provider) =>
      provider.capabilities.includes('answers') &&
      !provider.unavailable &&
      isAnswerProviderId(provider.id)
  ).map((provider) => ({ id: provider.id as AnswerProviderId, label: provider.label }))
}

export function hasKey(state: PublicSettingsState, provider: ProviderId): boolean {
  if (provider === 'openai') return state.hasOpenAIKey
  if (provider === 'anthropic') return state.hasAnthropicKey
  return state.hasGeminiKey
}

function keyField(vendor: AnswerProviderId): 'openaiKey' | 'anthropicKey' {
  return vendor === 'openai' ? 'openaiKey' : 'anthropicKey'
}

export function vendorsWithKeys(state: PublicSettingsState): AnswerProviderId[] {
  return answerVendors()
    .map((vendor) => vendor.id)
    .filter((id) => hasKey(state, id))
}

/** One key needs no choice; with more than one, the reader picks which vendor writes summaries. */
export function showVendorSelect(state: PublicSettingsState): boolean {
  return vendorsWithKeys(state).length > 1
}

/** The vendor that writes summaries: the chosen one if it has a key, else the first that does. */
export function summarizingVendor(state: PublicSettingsState): AnswerProviderId | null {
  const keyed = vendorsWithKeys(state)
  if (keyed.length === 0) return null
  return keyed.includes(state.answerProvider) ? state.answerProvider : keyed[0]!
}

function summarizingModel(state: PublicSettingsState, vendor: AnswerProviderId): string {
  return vendor === state.answerProvider ? state.answerModel : defaultAnswerModelForProvider(vendor)
}

export function canGenerateSummaries(state: PublicSettingsState): boolean {
  return summarizingVendor(state) !== null
}

export function canEnableSemantic(state: PublicSettingsState): boolean {
  return state.hasOpenAIKey
}

/** Consent is for one vendor and model; a different choice needs it again. */
export function consentGiven(state: PublicSettingsState): boolean {
  const vendor = summarizingVendor(state)
  if (!vendor) return false
  return acknowledgementMatches(
    state.cloudAnswersAcknowledgement,
    vendor,
    summarizingModel(state, vendor)
  )
}

export function summariesPatch(on: boolean): SettingsPatch {
  if (on) return { cloudAnswersEnabled: true }
  return { cloudAnswersEnabled: false, cloudAnswersAcknowledgement: null }
}

export function consentPatch(state: PublicSettingsState, on: boolean): SettingsPatch {
  if (!on) return { cloudAnswersAcknowledgement: null }
  const vendor = summarizingVendor(state)
  if (!vendor) return {}
  const model = summarizingModel(state, vendor)
  return {
    // Main checks consent against the saved provider and model, so they must be the ones consented to.
    ...(vendor !== state.answerProvider ? { answerProvider: vendor, answerModel: model } : {}),
    cloudAnswersAcknowledgement: acknowledgementForSave(
      state.cloudAnswersAcknowledgement,
      vendor,
      model
    )
  }
}

export function vendorChoicePatch(
  state: PublicSettingsState,
  vendor: AnswerProviderId
): SettingsPatch {
  return {
    answerProvider: vendor,
    answerModel: answerModelBelongsToProvider(state.answerModel, vendor)
      ? state.answerModel
      : defaultAnswerModelForProvider(vendor)
  }
}

export function semanticPatch(state: PublicSettingsState, on: boolean): SettingsPatch {
  if (!on) return { semanticIndexEnabled: false, semanticIndexAcknowledgement: null }
  return {
    semanticIndexEnabled: true,
    embeddingProvider: 'openai',
    embeddingModel: EMBEDDING_MODEL,
    semanticIndexAcknowledgement: acknowledgementForSave(
      state.semanticIndexAcknowledgement,
      'openai',
      EMBEDDING_MODEL
    )
  }
}

export function keySavedPatch(
  state: PublicSettingsState,
  vendor: AnswerProviderId,
  key: string
): SettingsPatch {
  const patch: SettingsPatch = { [keyField(vendor)]: key }
  // The first key makes its vendor the one that writes summaries.
  if (vendorsWithKeys(state).length === 0 && state.answerProvider !== vendor) {
    Object.assign(patch, vendorChoicePatch(state, vendor))
  }
  return patch
}

export function keyRemovedPatch(
  state: PublicSettingsState,
  vendor: AnswerProviderId
): SettingsPatch {
  const patch: SettingsPatch = { deleteProviderKeys: [vendor] }
  const remaining = vendorsWithKeys(state).filter((id) => id !== vendor)

  if (summarizingVendor(state) === vendor) {
    if (remaining.length > 0) {
      const next = remaining[0]!
      patch.answerProvider = next
      patch.answerModel = defaultAnswerModelForProvider(next)
    } else if (state.cloudAnswersEnabled) {
      Object.assign(patch, summariesPatch(false))
    }
  }
  // Semantic search embeds with OpenAI, so it cannot stay on without that key.
  if (vendor === 'openai' && state.semanticIndexEnabled) {
    Object.assign(patch, semanticPatch(state, false))
  }
  return patch
}
