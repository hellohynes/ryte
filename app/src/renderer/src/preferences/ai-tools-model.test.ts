import { describe, expect, it } from 'vitest'

import {
  answerVendors,
  canEnableSemantic,
  canGenerateSummaries,
  consentGiven,
  consentPatch,
  keyRemovedPatch,
  keySavedPatch,
  semanticPatch,
  showVendorSelect,
  summariesPatch,
  summarizingVendor,
  vendorChoicePatch,
  vendorsWithKeys
} from './ai-tools-model'
import type { PublicSettingsState } from '../../../main/settings/settings-store'

function state(overrides: Partial<PublicSettingsState> = {}): PublicSettingsState {
  return {
    notesRoot: '/notes',
    model: 'gpt-5.2',
    cloudAnswersEnabled: false,
    semanticIndexEnabled: false,
    firstCloudUseAcknowledgedAt: null,
    cloudAnswersAcknowledgement: null,
    semanticIndexAcknowledgement: null,
    answerProvider: 'openai',
    answerModel: 'gpt-5.2',
    embeddingProvider: 'openai',
    embeddingModel: 'text-embedding-3-small',
    searchHistoryRetention: '30-days',
    searchHistoryIncludesAnswers: true,
    scrollbarVisibility: 'auto',
    fontFamily: 'geist',
    colorMode: 'system',
    ticketLinkBase: '',
    pullRequestLinkBase: '',
    hasAnthropicKey: false,
    hasOpenAIKey: false,
    hasGeminiKey: false,
    providerKeyMetadata: {},
    discoveredOpenAIModels: null,
    keychainAvailable: true,
    ...overrides
  }
}

const ack = (
  provider: 'openai' | 'anthropic',
  model: string
): { acknowledgedAt: string; provider: 'openai' | 'anthropic'; model: string } => ({
  acknowledgedAt: '2026-10-26T12:00:00.000Z',
  provider,
  model
})

describe('vendors', () => {
  it('lists the vendors that can write summaries, from the registry', () => {
    expect(answerVendors().map((vendor) => vendor.id)).toEqual(['openai', 'anthropic'])
    expect(answerVendors().map((vendor) => vendor.label)).toEqual(['OpenAI', 'Anthropic'])
  })

  it('knows which vendors have a saved key, and shows the vendor choice only for more than one', () => {
    expect(vendorsWithKeys(state())).toEqual([])
    expect(vendorsWithKeys(state({ hasOpenAIKey: true }))).toEqual(['openai'])
    expect(showVendorSelect(state({ hasOpenAIKey: true }))).toBe(false)
    const both = state({ hasOpenAIKey: true, hasAnthropicKey: true })
    expect(vendorsWithKeys(both)).toEqual(['openai', 'anthropic'])
    expect(showVendorSelect(both)).toBe(true)
  })

  it('writes summaries with the chosen vendor, or the only one that has a key', () => {
    expect(summarizingVendor(state())).toBeNull()
    expect(summarizingVendor(state({ hasAnthropicKey: true, answerProvider: 'openai' }))).toBe(
      'anthropic'
    )
    const both = state({ hasOpenAIKey: true, hasAnthropicKey: true, answerProvider: 'anthropic' })
    expect(summarizingVendor(both)).toBe('anthropic')
  })

  it("turns a vendor choice into a provider and that vendor's default model", () => {
    expect(vendorChoicePatch(state({ answerModel: 'gpt-5.2' }), 'anthropic')).toEqual({
      answerProvider: 'anthropic',
      answerModel: 'claude-haiku-4-5'
    })
  })
})

describe('summaries and consent', () => {
  it('needs a vendor with a key before summaries can be switched on', () => {
    expect(canGenerateSummaries(state())).toBe(false)
    expect(canGenerateSummaries(state({ hasOpenAIKey: true }))).toBe(true)
  })

  it('switches summaries on without touching consent, and off together with it', () => {
    expect(summariesPatch(true)).toEqual({
      cloudAnswersEnabled: true
    })
    expect(summariesPatch(false)).toEqual({
      cloudAnswersEnabled: false,
      cloudAnswersAcknowledgement: null
    })
  })

  it('treats consent as given only for the vendor and model in use', () => {
    const consented = state({
      hasOpenAIKey: true,
      cloudAnswersAcknowledgement: ack('openai', 'gpt-5.2')
    })
    expect(consentGiven(consented)).toBe(true)
    expect(consentGiven({ ...consented, answerModel: 'gpt-5.1' })).toBe(false)
    expect(consentGiven({ ...consented, hasAnthropicKey: true, answerProvider: 'anthropic' })).toBe(
      false
    )
    expect(consentGiven(state())).toBe(false)
  })

  it('records consent for the current vendor and model, and withdraws it', () => {
    const current = state({ hasOpenAIKey: true })
    const given = consentPatch(current, true)
    expect(given.cloudAnswersAcknowledgement).toMatchObject({
      provider: 'openai',
      model: 'gpt-5.2'
    })
    expect(consentPatch(current, false)).toEqual({ cloudAnswersAcknowledgement: null })
  })
})

describe('semantic search', () => {
  it('needs an OpenAI key, whichever vendor writes summaries', () => {
    expect(canEnableSemantic(state({ hasAnthropicKey: true }))).toBe(false)
    expect(canEnableSemantic(state({ hasOpenAIKey: true }))).toBe(true)
  })

  it('records consent for embeddings when it is switched on, and clears it when switched off', () => {
    const on = semanticPatch(state({ hasOpenAIKey: true }), true)
    expect(on).toMatchObject({
      semanticIndexEnabled: true,
      embeddingProvider: 'openai',
      embeddingModel: 'text-embedding-3-small'
    })
    expect(on.semanticIndexAcknowledgement).toMatchObject({
      provider: 'openai',
      model: 'text-embedding-3-small'
    })
    expect(semanticPatch(state(), false)).toEqual({
      semanticIndexEnabled: false,
      semanticIndexAcknowledgement: null
    })
  })
})

describe('keys', () => {
  it('saves a key, and makes the first vendor with a key the one that writes summaries', () => {
    expect(keySavedPatch(state({ answerProvider: 'openai' }), 'anthropic', 'sk-ant-x')).toEqual({
      anthropicKey: 'sk-ant-x',
      answerProvider: 'anthropic',
      answerModel: 'claude-haiku-4-5'
    })
  })

  it('keeps the vendor already in use when another key is added', () => {
    expect(
      keySavedPatch(
        state({ hasOpenAIKey: true, answerProvider: 'openai' }),
        'anthropic',
        'sk-ant-x'
      )
    ).toEqual({ anthropicKey: 'sk-ant-x' })
  })

  it('removes a key, moving summaries to the other vendor when there is one', () => {
    const both = state({
      hasOpenAIKey: true,
      hasAnthropicKey: true,
      answerProvider: 'openai',
      cloudAnswersEnabled: true
    })
    expect(keyRemovedPatch(both, 'openai')).toEqual({
      deleteProviderKeys: ['openai'],
      answerProvider: 'anthropic',
      answerModel: 'claude-haiku-4-5'
    })
  })

  it('moves to OpenAI with its own default model when the Anthropic key in use is removed', () => {
    const both = state({
      hasOpenAIKey: true,
      hasAnthropicKey: true,
      answerProvider: 'anthropic',
      answerModel: 'claude-sonnet-4-6',
      cloudAnswersEnabled: true
    })
    expect(keyRemovedPatch(both, 'anthropic')).toEqual({
      deleteProviderKeys: ['anthropic'],
      answerProvider: 'openai',
      answerModel: 'gpt-5.2'
    })
  })

  it('switches summaries off when the last vendor key goes, and semantic search with the OpenAI key', () => {
    const only = state({
      hasOpenAIKey: true,
      cloudAnswersEnabled: true,
      semanticIndexEnabled: true,
      cloudAnswersAcknowledgement: ack('openai', 'gpt-5.2'),
      semanticIndexAcknowledgement: ack('openai', 'text-embedding-3-small')
    })
    expect(keyRemovedPatch(only, 'openai')).toEqual({
      deleteProviderKeys: ['openai'],
      cloudAnswersEnabled: false,
      cloudAnswersAcknowledgement: null,
      semanticIndexEnabled: false,
      semanticIndexAcknowledgement: null
    })
  })

  it('leaves everything else alone when a key that is not in use is removed', () => {
    const both = state({ hasOpenAIKey: true, hasAnthropicKey: true, answerProvider: 'openai' })
    expect(keyRemovedPatch(both, 'anthropic')).toEqual({ deleteProviderKeys: ['anthropic'] })
  })
})
