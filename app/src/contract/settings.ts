import { z } from 'zod'

import { isFontId, type FontId } from '../shared/fonts'
import { isReferenceLinkBase } from '../shared/reference-links'
import { defineArea, defineOperation } from './define'
import { absolutePath, hasNoExplicitUndefined } from './primitives'

// The enums behind the setting types. The schemas are the definition; the types are inferred from them.
const providerId = z.enum(['anthropic', 'openai', 'gemini'])
const answerProviderId = z.enum(['anthropic', 'openai'])
const colorMode = z.enum(['system', 'light', 'dark'])
const scrollbarVisibility = z.enum(['auto', 'always'])
const searchHistoryRetention = z.enum(['off', 'session', '7-days', '30-days', 'forever'])
const embeddingProviderId = z.literal('openai')
const embeddingModelId = z.literal('text-embedding-3-small')
const fontId = z.custom<FontId>(isFontId, 'Expected a font')

/** A model id: trimmed length 1 to 200, and kept exactly as given (the legacy validator did not trim it). */
const modelId = z.string().refine((value) => {
  const length = value.trim().length
  return length >= 1 && length <= 200
}, 'Expected a model id')

const linkBase = z.string().refine(isReferenceLinkBase, 'Expected an https address or empty')

/** A provider key: must not be blank, stored trimmed. */
const providerKey = z
  .string()
  .refine((value) => value.trim().length > 0, 'Expected a key')
  .transform((value) => value.trim())

/** The record that a person agreed to send data to a provider. Unknown fields are rejected. */
const dataFlowAcknowledgement = z.strictObject({
  acknowledgedAt: z.string(),
  provider: providerId,
  model: z.string().min(1)
})

const providerKeyMetadata = z.object({ lastValidatedAt: z.string().nullable() })

/** What the settings pane may read: whether a key exists, never the key. */
const publicSettingsState = z.object({
  notesRoot: z.string(),
  model: z.string(),
  cloudAnswersEnabled: z.boolean(),
  semanticIndexEnabled: z.boolean(),
  firstCloudUseAcknowledgedAt: z.string().nullable(),
  cloudAnswersAcknowledgement: dataFlowAcknowledgement.nullable(),
  semanticIndexAcknowledgement: dataFlowAcknowledgement.nullable(),
  answerProvider: answerProviderId,
  answerModel: z.string(),
  embeddingProvider: embeddingProviderId,
  embeddingModel: embeddingModelId,
  searchHistoryRetention,
  searchHistoryIncludesAnswers: z.boolean(),
  scrollbarVisibility,
  fontFamily: fontId,
  colorMode,
  ticketLinkBase: z.string(),
  pullRequestLinkBase: z.string(),
  hasAnthropicKey: z.boolean(),
  hasOpenAIKey: z.boolean(),
  hasGeminiKey: z.boolean(),
  providerKeyMetadata: z.partialRecord(providerId, providerKeyMetadata),
  /** The model IDs the last refresh found for the OpenAI key, in the order returned. */
  discoveredOpenAIModels: z.array(z.string()).nullable(),
  keychainAvailable: z.boolean()
})

/**
 * A change to the settings: any of these keys, each optional, none explicitly `undefined`. The three
 * provider keys are the only secrets; they go in here and are never returned.
 */
const settingsPatch = z
  .strictObject({
    notesRoot: absolutePath.optional(),
    model: modelId.optional(),
    cloudAnswersEnabled: z.boolean().optional(),
    semanticIndexEnabled: z.boolean().optional(),
    firstCloudUseAcknowledgedAt: z.string().nullable().optional(),
    cloudAnswersAcknowledgement: dataFlowAcknowledgement.nullable().optional(),
    semanticIndexAcknowledgement: dataFlowAcknowledgement.nullable().optional(),
    answerProvider: answerProviderId.optional(),
    answerModel: modelId.optional(),
    embeddingProvider: embeddingProviderId.optional(),
    embeddingModel: embeddingModelId.optional(),
    searchHistoryRetention: searchHistoryRetention.optional(),
    searchHistoryIncludesAnswers: z.boolean().optional(),
    scrollbarVisibility: scrollbarVisibility.optional(),
    fontFamily: fontId.optional(),
    colorMode: colorMode.optional(),
    ticketLinkBase: linkBase.optional(),
    pullRequestLinkBase: linkBase.optional(),
    anthropicKey: providerKey.optional(),
    openaiKey: providerKey.optional(),
    geminiKey: providerKey.optional(),
    deleteProviderKeys: z.array(providerId).optional()
  })
  .refine(hasNoExplicitUndefined, 'Expected defined values')

/** Which provider a key operation is about. An object, like every contract input. */
const providerInput = z.strictObject({ provider: providerId })

const keyValidationResult = z.object({
  ok: z.boolean(),
  provider: providerId,
  validatedAt: z.string().nullable(),
  error: z.string().optional()
})

const exampleState = {
  notesRoot: '/Users/example/Notes',
  model: 'gpt-5.2',
  cloudAnswersEnabled: false,
  semanticIndexEnabled: false,
  firstCloudUseAcknowledgedAt: null,
  cloudAnswersAcknowledgement: null,
  semanticIndexAcknowledgement: null,
  answerProvider: 'openai' as const,
  answerModel: 'gpt-5.2',
  embeddingProvider: 'openai' as const,
  embeddingModel: 'text-embedding-3-small' as const,
  searchHistoryRetention: '30-days' as const,
  searchHistoryIncludesAnswers: false,
  scrollbarVisibility: 'auto' as const,
  fontFamily: 'geist' as FontId,
  colorMode: 'system' as const,
  ticketLinkBase: '',
  pullRequestLinkBase: '',
  hasAnthropicKey: false,
  hasOpenAIKey: false,
  hasGeminiKey: false,
  providerKeyMetadata: {},
  discoveredOpenAIModels: null,
  keychainAvailable: true
}

export const getState = defineOperation({
  channel: 'settings:get-state',
  description:
    'The current settings, with whether each provider key exists and never the key itself.',
  input: z.undefined(),
  output: publicSettingsState,
  example: { input: undefined, output: exampleState }
})

export const save = defineOperation({
  channel: 'settings:save',
  description:
    'Change some settings and return the new state. A change that affects indexing restarts the indexer. Provider keys are write-only.',
  input: settingsPatch,
  output: publicSettingsState,
  example: { input: { colorMode: 'dark' }, output: { ...exampleState, colorMode: 'dark' } }
})

export const validateKey = defineOperation({
  channel: 'settings:validate-key',
  description:
    'Check the saved key for a provider with that provider and record when it last passed.',
  input: providerInput,
  output: keyValidationResult,
  example: {
    input: { provider: 'openai' },
    output: {
      ok: false,
      provider: 'openai',
      validatedAt: null,
      error: 'No saved API key to validate.'
    }
  }
})

export const listModels = defineOperation({
  channel: 'settings:list-models',
  description: 'List the models the saved OpenAI key can use, and remember the list.',
  input: providerInput,
  output: z.array(z.string()),
  example: { input: { provider: 'openai' }, output: ['gpt-5.2'] }
})

export const settings = defineArea('settings', {
  operations: { getState, save, validateKey, listModels },
  events: {}
})

export type ProviderId = z.output<typeof providerId>
export type ColorMode = z.output<typeof colorMode>
export type ScrollbarVisibility = z.output<typeof scrollbarVisibility>
export type SearchHistoryRetention = z.output<typeof searchHistoryRetention>
export type DataFlowAcknowledgement = z.output<typeof dataFlowAcknowledgement>
export type ProviderKeyMetadata = z.output<typeof providerKeyMetadata>
export type PublicSettingsState = z.output<typeof publicSettingsState>
export type SettingsUpdate = z.output<typeof settingsPatch>
export type ProviderKeyValidationResult = z.output<typeof keyValidationResult>
