import { describe, expect, it } from 'vitest'

import {
  answerModelBelongsToProvider,
  answerModels,
  defaultAnswerModelForProvider,
  isAnswerModelId,
  isProviderId,
  providerForAnswerModel
} from './provider-registry'

describe('provider registry', () => {
  it('exposes answer models by provider', () => {
    expect(answerModels('openai').map((model) => model.id)).toContain('gpt-5.2')
    expect(answerModels('anthropic').map((model) => model.id)).toContain('claude-haiku-4-5')
  })

  it('maps answer models to their providers', () => {
    expect(providerForAnswerModel('gpt-5.2')).toBe('openai')
    expect(providerForAnswerModel('claude-sonnet-4-6')).toBe('anthropic')
    expect(answerModelBelongsToProvider('gpt-5.2', 'anthropic')).toBe(false)
  })

  it('validates provider and model ids', () => {
    expect(isProviderId('gemini')).toBe(true)
    expect(isAnswerModelId('gpt-6-luna')).toBe(true)
    expect(isAnswerModelId('text-embedding-3-small')).toBe(true)
    expect(isAnswerModelId('')).toBe(false)
  })

  it('keeps provider defaults explicit', () => {
    expect(defaultAnswerModelForProvider('openai')).toBe('gpt-5.2')
    expect(defaultAnswerModelForProvider('anthropic')).toBe('claude-haiku-4-5')
  })
})
