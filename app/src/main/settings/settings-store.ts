import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { DEFAULT_FONT_ID, isFontId, type FontId } from '../../shared/fonts'
import { isReferenceLinkBase } from '../../shared/reference-links'
import { defaultNotesRoot, settingsFilePath } from '../paths'
import {
  answerModelBelongsToProvider,
  defaultAnswerModelForProvider,
  isAnswerModelId,
  isAnswerProviderId,
  isEmbeddingModelId,
  isEmbeddingProviderId,
  isProviderId,
  providerForAnswerModel,
  type AnswerModelId,
  type AnswerProviderId,
  type EmbeddingModelId,
  type EmbeddingProviderId,
  type ModelId,
  type ProviderId
} from '../../shared/provider-registry'
import { keychain } from './keychain'

export const SETTINGS_SCHEMA_VERSION = 4

export type {
  AnswerModelId,
  AnswerProviderId,
  EmbeddingModelId,
  EmbeddingProviderId,
  ModelId,
  ProviderId
}

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

export interface SettingsFile {
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION
  notesRoot: string
  cloudAnswersEnabled: boolean
  semanticIndexEnabled: boolean
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
  encryptedKeys: Partial<Record<ProviderId, string>>
  providerKeyMetadata: Partial<Record<ProviderId, ProviderKeyMetadata>>
  /** What the last "Refresh models" found for the saved OpenAI key; null until one has run. */
  discoveredOpenAIModels: string[] | null
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

function defaultSettings(): SettingsFile {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    notesRoot: defaultNotesRoot(),
    cloudAnswersEnabled: false,
    semanticIndexEnabled: false,
    cloudAnswersAcknowledgement: null,
    semanticIndexAcknowledgement: null,
    answerProvider: 'openai',
    answerModel: 'gpt-5.2',
    embeddingProvider: 'openai',
    embeddingModel: 'text-embedding-3-small',
    searchHistoryRetention: '30-days',
    searchHistoryIncludesAnswers: true,
    scrollbarVisibility: 'auto',
    fontFamily: DEFAULT_FONT_ID,
    colorMode: 'system',
    ticketLinkBase: '',
    pullRequestLinkBase: '',
    encryptedKeys: {},
    providerKeyMetadata: {},
    discoveredOpenAIModels: null
  }
}

export function modelProvider(model: ModelId): AnswerProviderId {
  return providerForAnswerModel(model)
}

function isSearchHistoryRetention(value: unknown): value is SearchHistoryRetention {
  return (
    value === 'off' ||
    value === 'session' ||
    value === '7-days' ||
    value === '30-days' ||
    value === 'forever'
  )
}

function isScrollbarVisibility(value: unknown): value is ScrollbarVisibility {
  return value === 'auto' || value === 'always'
}

function isColorMode(value: unknown): value is ColorMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

function isDataFlowAcknowledgement(value: unknown): value is DataFlowAcknowledgement {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<DataFlowAcknowledgement>
  return (
    typeof candidate.acknowledgedAt === 'string' &&
    isProviderId(candidate.provider) &&
    typeof candidate.model === 'string'
  )
}

function providerKeyMetadata(value: unknown): Partial<Record<ProviderId, ProviderKeyMetadata>> {
  if (!value || typeof value !== 'object') return {}
  const result: Partial<Record<ProviderId, ProviderKeyMetadata>> = {}
  for (const provider of ['anthropic', 'openai', 'gemini'] satisfies ProviderId[]) {
    const item = (value as Partial<Record<ProviderId, ProviderKeyMetadata>>)[provider]
    result[provider] = {
      lastValidatedAt:
        item && typeof item.lastValidatedAt === 'string' ? item.lastValidatedAt : null
    }
  }
  return result
}

const MAX_DISCOVERED_MODELS = 1000
const MAX_MODEL_ID_LENGTH = 200

/** A list of model IDs worth keeping: strings of sensible length, once each, never empty. */
function modelIdList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const ids = new Set<string>()
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0 && item.length <= MAX_MODEL_ID_LENGTH) {
      ids.add(item)
      if (ids.size === MAX_DISCOVERED_MODELS) break
    }
  }
  return ids.size > 0 ? [...ids] : null
}

type LegacySettingsFile = Partial<SettingsFile> & {
  firstCloudUseAcknowledgedAt?: string | null
  model?: ModelId
}

function migrateSettings(parsed: LegacySettingsFile): SettingsFile {
  const defaults = defaultSettings()
  const legacyModel = isAnswerModelId(parsed.model) ? parsed.model : null
  const answerModel = isAnswerModelId(parsed.answerModel)
    ? parsed.answerModel
    : (legacyModel ?? defaults.answerModel)
  const answerProvider = isAnswerProviderId(parsed.answerProvider)
    ? parsed.answerProvider
    : modelProvider(answerModel)

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    notesRoot: typeof parsed.notesRoot === 'string' ? parsed.notesRoot : defaults.notesRoot,
    cloudAnswersEnabled:
      typeof parsed.cloudAnswersEnabled === 'boolean'
        ? parsed.cloudAnswersEnabled
        : defaults.cloudAnswersEnabled,
    semanticIndexEnabled:
      typeof parsed.semanticIndexEnabled === 'boolean'
        ? parsed.semanticIndexEnabled
        : defaults.semanticIndexEnabled,
    cloudAnswersAcknowledgement: isDataFlowAcknowledgement(parsed.cloudAnswersAcknowledgement)
      ? parsed.cloudAnswersAcknowledgement
      : typeof parsed.firstCloudUseAcknowledgedAt === 'string'
        ? {
            acknowledgedAt: parsed.firstCloudUseAcknowledgedAt,
            provider: answerProvider,
            model: answerModel
          }
        : null,
    semanticIndexAcknowledgement: isDataFlowAcknowledgement(parsed.semanticIndexAcknowledgement)
      ? parsed.semanticIndexAcknowledgement
      : null,
    answerProvider,
    answerModel: answerModelBelongsToProvider(answerModel, answerProvider)
      ? answerModel
      : defaultAnswerModelForProvider(answerProvider),
    embeddingProvider: isEmbeddingProviderId(parsed.embeddingProvider)
      ? parsed.embeddingProvider
      : defaults.embeddingProvider,
    embeddingModel: isEmbeddingModelId(parsed.embeddingModel)
      ? parsed.embeddingModel
      : defaults.embeddingModel,
    searchHistoryRetention: isSearchHistoryRetention(parsed.searchHistoryRetention)
      ? parsed.searchHistoryRetention
      : defaults.searchHistoryRetention,
    // A file that predates the option behaved as off, so an upgrade keeps it off; only a new
    // install starts with summaries saved.
    searchHistoryIncludesAnswers:
      typeof parsed.searchHistoryIncludesAnswers === 'boolean'
        ? parsed.searchHistoryIncludesAnswers
        : false,
    scrollbarVisibility: isScrollbarVisibility(parsed.scrollbarVisibility)
      ? parsed.scrollbarVisibility
      : defaults.scrollbarVisibility,
    fontFamily: isFontId(parsed.fontFamily) ? parsed.fontFamily : defaults.fontFamily,
    colorMode: isColorMode(parsed.colorMode) ? parsed.colorMode : defaults.colorMode,
    ticketLinkBase: isReferenceLinkBase(parsed.ticketLinkBase)
      ? parsed.ticketLinkBase
      : defaults.ticketLinkBase,
    pullRequestLinkBase: isReferenceLinkBase(parsed.pullRequestLinkBase)
      ? parsed.pullRequestLinkBase
      : defaults.pullRequestLinkBase,
    encryptedKeys: parsed.encryptedKeys ?? {},
    providerKeyMetadata: providerKeyMetadata(parsed.providerKeyMetadata),
    discoveredOpenAIModels: modelIdList(parsed.discoveredOpenAIModels)
  }
}

export class SettingsStore {
  private cache: SettingsFile | null = null

  load(): SettingsFile {
    if (this.cache) return this.cache
    const path = settingsFilePath()
    if (!existsSync(path)) {
      this.cache = defaultSettings()
      return this.cache
    }
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as LegacySettingsFile
    this.cache = migrateSettings(parsed)
    if (
      parsed.schemaVersion !== SETTINGS_SCHEMA_VERSION ||
      parsed.scrollbarVisibility !== this.cache.scrollbarVisibility
    ) {
      this.persist(this.cache)
    }
    return this.cache
  }

  private persist(next: SettingsFile): void {
    const path = settingsFilePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(next, null, 2), 'utf-8')
    this.cache = next
  }

  publicState(): PublicSettingsState {
    const s = this.load()
    return {
      notesRoot: s.notesRoot,
      model: s.answerModel,
      cloudAnswersEnabled: s.cloudAnswersEnabled,
      semanticIndexEnabled: s.semanticIndexEnabled,
      firstCloudUseAcknowledgedAt: s.cloudAnswersAcknowledgement?.acknowledgedAt ?? null,
      cloudAnswersAcknowledgement: s.cloudAnswersAcknowledgement,
      semanticIndexAcknowledgement: s.semanticIndexAcknowledgement,
      answerProvider: s.answerProvider,
      answerModel: s.answerModel,
      embeddingProvider: s.embeddingProvider,
      embeddingModel: s.embeddingModel,
      searchHistoryRetention: s.searchHistoryRetention,
      searchHistoryIncludesAnswers: s.searchHistoryIncludesAnswers,
      scrollbarVisibility: s.scrollbarVisibility,
      fontFamily: s.fontFamily,
      colorMode: s.colorMode,
      ticketLinkBase: s.ticketLinkBase,
      pullRequestLinkBase: s.pullRequestLinkBase,
      hasAnthropicKey: !!s.encryptedKeys.anthropic,
      hasOpenAIKey: !!s.encryptedKeys.openai,
      hasGeminiKey: !!s.encryptedKeys.gemini,
      providerKeyMetadata: s.providerKeyMetadata,
      discoveredOpenAIModels: s.discoveredOpenAIModels,
      keychainAvailable: keychain.isAvailable()
    }
  }

  getSecret(provider: ProviderId): string | null {
    const s = this.load()
    const encoded = s.encryptedKeys[provider]
    if (!encoded) return null
    return keychain.decrypt(encoded)
  }

  update(patch: SettingsUpdate): PublicSettingsState {
    const current = this.load()
    const next: SettingsFile = {
      ...current,
      encryptedKeys: { ...current.encryptedKeys },
      providerKeyMetadata: { ...current.providerKeyMetadata }
    }
    if (patch.notesRoot !== undefined) next.notesRoot = patch.notesRoot
    if (patch.cloudAnswersEnabled !== undefined) {
      next.cloudAnswersEnabled = patch.cloudAnswersEnabled
    }
    if (patch.semanticIndexEnabled !== undefined) {
      next.semanticIndexEnabled = patch.semanticIndexEnabled
    }
    if (patch.firstCloudUseAcknowledgedAt !== undefined) {
      next.cloudAnswersAcknowledgement = patch.firstCloudUseAcknowledgedAt
        ? {
            acknowledgedAt: patch.firstCloudUseAcknowledgedAt,
            provider: next.answerProvider,
            model: next.answerModel
          }
        : null
    }
    if (patch.cloudAnswersAcknowledgement !== undefined) {
      next.cloudAnswersAcknowledgement = patch.cloudAnswersAcknowledgement
    }
    if (patch.semanticIndexAcknowledgement !== undefined) {
      next.semanticIndexAcknowledgement = patch.semanticIndexAcknowledgement
    }
    if (patch.answerProvider !== undefined) next.answerProvider = patch.answerProvider
    if (patch.answerModel !== undefined) {
      next.answerModel = patch.answerModel
      next.answerProvider = modelProvider(patch.answerModel)
    }
    if (patch.model !== undefined) {
      next.answerModel = patch.model
      next.answerProvider = modelProvider(patch.model)
    }
    if (!answerModelBelongsToProvider(next.answerModel, next.answerProvider)) {
      next.answerModel = defaultAnswerModelForProvider(next.answerProvider)
    }
    if (patch.embeddingProvider !== undefined) next.embeddingProvider = patch.embeddingProvider
    if (patch.embeddingModel !== undefined) next.embeddingModel = patch.embeddingModel
    if (patch.searchHistoryRetention !== undefined) {
      next.searchHistoryRetention = patch.searchHistoryRetention
    }
    if (patch.searchHistoryIncludesAnswers !== undefined) {
      next.searchHistoryIncludesAnswers = patch.searchHistoryIncludesAnswers
    }
    if (patch.scrollbarVisibility !== undefined) {
      next.scrollbarVisibility = patch.scrollbarVisibility
    }
    if (patch.fontFamily !== undefined) next.fontFamily = patch.fontFamily
    if (patch.colorMode !== undefined) next.colorMode = patch.colorMode
    if (patch.ticketLinkBase !== undefined) next.ticketLinkBase = patch.ticketLinkBase
    if (patch.pullRequestLinkBase !== undefined) {
      next.pullRequestLinkBase = patch.pullRequestLinkBase
    }

    for (const provider of patch.deleteProviderKeys ?? []) {
      delete next.encryptedKeys[provider]
      next.providerKeyMetadata[provider] = { lastValidatedAt: null }
      // The list was fetched with this key, and another key may be allowed different models.
      if (provider === 'openai') next.discoveredOpenAIModels = null
    }

    if (patch.anthropicKey !== undefined) {
      const enc = keychain.encrypt(patch.anthropicKey)
      if (enc === null) throw new Error('Keychain unavailable')
      next.encryptedKeys.anthropic = enc
      next.providerKeyMetadata.anthropic = { lastValidatedAt: null }
    }
    if (patch.openaiKey !== undefined) {
      const enc = keychain.encrypt(patch.openaiKey)
      if (enc === null) throw new Error('Keychain unavailable')
      next.encryptedKeys.openai = enc
      next.providerKeyMetadata.openai = { lastValidatedAt: null }
      next.discoveredOpenAIModels = null
    }
    if (patch.geminiKey !== undefined) {
      const enc = keychain.encrypt(patch.geminiKey)
      if (enc === null) throw new Error('Keychain unavailable')
      next.encryptedKeys.gemini = enc
      next.providerKeyMetadata.gemini = { lastValidatedAt: null }
    }

    this.persist(next)
    return this.publicState()
  }

  /** Remembers what a refresh found, so the picker lists it again after a restart. */
  recordDiscoveredOpenAIModels(ids: string[]): PublicSettingsState {
    this.persist({ ...this.load(), discoveredOpenAIModels: modelIdList(ids) })
    return this.publicState()
  }

  markKeyValidated(
    provider: ProviderId,
    validatedAt = new Date().toISOString()
  ): PublicSettingsState {
    const current = this.load()
    this.persist({
      ...current,
      providerKeyMetadata: {
        ...current.providerKeyMetadata,
        [provider]: { lastValidatedAt: validatedAt }
      }
    })
    return this.publicState()
  }
}

export const settingsStore = new SettingsStore()
