// FROZEN SNAPSHOT of the hand-written declarations in `src/main/settings/settings-store.ts` and `key-validation.ts`
// before the contract replaced them (copied from git at 322bfd7), plus the intended signatures of the four
// `window.ryte.settings` members. It is the oracle for the type-equality check in `settings.wire-types.check.ts`:
// the types inferred from the contract must equal these. Do not edit.
//
// The members `validateKey` and `listModels` take `{ provider }` instead of the bare provider the old preload
// took. Every contract input is a strict object, so a bare value would be an exception to that rule; the
// signatures below are written by hand on purpose and are not derived.
import type { FontId } from '../shared/fonts'
import type {
  AnswerModelId,
  AnswerProviderId,
  EmbeddingModelId,
  EmbeddingProviderId,
  ModelId,
  ProviderId
} from '../shared/provider-registry'

export type SearchHistoryRetention = 'off' | 'session' | '7-days' | '30-days' | 'forever'

export type ScrollbarVisibility = 'auto' | 'always'

export type ColorMode = 'system' | 'light' | 'dark'

export interface DataFlowAcknowledgement {
  acknowledgedAt: string
  provider: ProviderId
  model: string
}

export interface ProviderKeyMetadata {
  lastValidatedAt: string | null
}

export interface PublicSettingsState {
  notesRoot: string
  model: ModelId
  cloudAnswersEnabled: boolean
  semanticIndexEnabled: boolean
  firstCloudUseAcknowledgedAt: string | null
  cloudAnswersAcknowledgement: DataFlowAcknowledgement | null
  semanticIndexAcknowledgement: DataFlowAcknowledgement | null
  answerProvider: AnswerProviderId
  answerModel: AnswerModelId
  embeddingProvider: EmbeddingProviderId
  embeddingModel: EmbeddingModelId
  searchHistoryRetention: SearchHistoryRetention
  searchHistoryIncludesAnswers: boolean
  scrollbarVisibility: ScrollbarVisibility
  fontFamily: FontId
  colorMode: ColorMode
  ticketLinkBase: string
  pullRequestLinkBase: string
  hasAnthropicKey: boolean
  hasOpenAIKey: boolean
  hasGeminiKey: boolean
  providerKeyMetadata: Partial<Record<ProviderId, ProviderKeyMetadata>>
  /** The model IDs the last refresh found for the OpenAI key, in the order returned. */
  discoveredOpenAIModels: string[] | null
  keychainAvailable: boolean
}

export interface SettingsUpdate {
  notesRoot?: string
  model?: ModelId
  cloudAnswersEnabled?: boolean
  semanticIndexEnabled?: boolean
  firstCloudUseAcknowledgedAt?: string | null
  cloudAnswersAcknowledgement?: DataFlowAcknowledgement | null
  semanticIndexAcknowledgement?: DataFlowAcknowledgement | null
  answerProvider?: AnswerProviderId
  answerModel?: AnswerModelId
  embeddingProvider?: EmbeddingProviderId
  embeddingModel?: EmbeddingModelId
  searchHistoryRetention?: SearchHistoryRetention
  searchHistoryIncludesAnswers?: boolean
  scrollbarVisibility?: ScrollbarVisibility
  fontFamily?: FontId
  colorMode?: ColorMode
  ticketLinkBase?: string
  pullRequestLinkBase?: string
  anthropicKey?: string
  openaiKey?: string
  geminiKey?: string
  deleteProviderKeys?: ProviderId[]
}

export interface ProviderKeyValidationResult {
  ok: boolean
  provider: ProviderId
  validatedAt: string | null
  error?: string
}

export interface SettingsApi {
  getState(): Promise<PublicSettingsState>
  save(patch: SettingsUpdate): Promise<PublicSettingsState>
  validateKey(input: { provider: ProviderId }): Promise<ProviderKeyValidationResult>
  listModels(input: { provider: ProviderId }): Promise<string[]>
}
