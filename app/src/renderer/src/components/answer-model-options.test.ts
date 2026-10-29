import { describe, expect, it } from 'vitest'

import {
  answerModelOptions,
  preferredOpenAIModel,
  refreshOpenAIModels,
  settleRefresh
} from './answer-model-options'

const registry = [
  { id: 'gpt-5.2', label: 'GPT-5.2' },
  { id: 'gpt-4o', label: 'GPT-4o' }
]

describe('answer model options', () => {
  it('lists the built-in models before any refresh', () => {
    expect(
      answerModelOptions({ provider: 'openai', registry, discovered: null, selected: 'gpt-5.2' })
    ).toEqual([
      { id: 'gpt-5.2', label: 'GPT-5.2' },
      { id: 'gpt-4o', label: 'GPT-4o' }
    ])
  })

  it('shows every authorized ID, in returned order, without filtering', () => {
    const discovered = ['text-embedding-3-small', 'gpt-6-luna', 'gpt-4o', 'whisper-1']
    const options = answerModelOptions({
      provider: 'openai',
      registry,
      discovered,
      selected: 'gpt-4o'
    })
    expect(options.map((option) => option.id)).toEqual(discovered)
    expect(options.find((option) => option.id === 'gpt-4o')?.label).toBe('GPT-4o')
    expect(options.find((option) => option.id === 'gpt-6-luna')?.label).toBe('gpt-6-luna')
  })

  it('keeps a selected model visible even when the refreshed list omits it', () => {
    const options = answerModelOptions({
      provider: 'openai',
      registry,
      discovered: ['gpt-6-luna'],
      selected: 'gpt-5.2'
    })
    expect(options[0]).toEqual({ id: 'gpt-5.2', label: 'GPT-5.2 (not in the refreshed list)' })
    expect(options.map((option) => option.id)).toEqual(['gpt-5.2', 'gpt-6-luna'])
  })

  it('shows a saved dynamic ID that the built-in list does not know', () => {
    const options = answerModelOptions({
      provider: 'openai',
      registry,
      discovered: null,
      selected: 'gpt-6-luna'
    })
    expect(options[0]).toEqual({ id: 'gpt-6-luna', label: 'gpt-6-luna' })
  })

  it('never applies OpenAI discovery to another provider', () => {
    const options = answerModelOptions({
      provider: 'anthropic',
      registry: [{ id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' }],
      discovered: ['gpt-6-luna'],
      selected: 'claude-haiku-4-5'
    })
    expect(options.map((option) => option.id)).toEqual(['claude-haiku-4-5'])
  })
})

describe('preferred OpenAI model after refresh', () => {
  const discovered = ['gpt-5.2', 'gpt-6-luna']

  it('prefers gpt-6-luna when nothing was explicitly chosen', () => {
    expect(preferredOpenAIModel({ selected: 'gpt-5.2', touched: false, discovered })).toBe(
      'gpt-6-luna'
    )
  })

  it('never overrides a selection the user made in this session', () => {
    expect(preferredOpenAIModel({ selected: 'gpt-5.2', touched: true, discovered })).toBe('gpt-5.2')
  })

  it('never overrides a non-default saved selection', () => {
    expect(preferredOpenAIModel({ selected: 'gpt-4o', touched: false, discovered })).toBe('gpt-4o')
  })

  it('falls back to the current selection when gpt-6-luna is not authorized', () => {
    expect(
      preferredOpenAIModel({ selected: 'gpt-5.2', touched: false, discovered: ['gpt-5.2'] })
    ).toBe('gpt-5.2')
  })
})

describe('refreshOpenAIModels', () => {
  it('returns every authorized ID and moves an unchosen default to gpt-6-luna', async () => {
    const result = await refreshOpenAIModels(
      async () => ['text-embedding-3-small', 'gpt-6-luna', 'gpt-5.2'],
      { selected: 'gpt-5.2', touched: false }
    )
    expect(result).toEqual({
      ok: true,
      models: ['text-embedding-3-small', 'gpt-6-luna', 'gpt-5.2'],
      selected: 'gpt-6-luna',
      message: 'Found 3 models for this key.'
    })
  })

  it('preserves an explicit selection', async () => {
    const result = await refreshOpenAIModels(async () => ['gpt-6-luna', 'gpt-5.2'], {
      selected: 'gpt-5.2',
      touched: true
    })
    expect(result).toMatchObject({ ok: true, selected: 'gpt-5.2' })
  })

  it('reports a failure without the IPC wrapper and without changing anything', async () => {
    const result = await refreshOpenAIModels(
      async () => {
        throw new Error(
          "Error invoking remote method 'settings:list-models': Error: No saved API key to list models"
        )
      },
      { selected: 'gpt-5.2', touched: false }
    )
    expect(result).toEqual({ ok: false, message: 'No saved API key to list models' })
  })
})

describe('settleRefresh', () => {
  const found = {
    ok: true as const,
    models: ['gpt-6-luna', 'gpt-5.2'],
    selected: 'gpt-6-luna',
    message: 'Found 2 models for this key.'
  }

  it('selects the model the refresh chose once the list is saved and contains it', () => {
    expect(settleRefresh(found, ['gpt-6-luna', 'gpt-5.2'], 'gpt-5.2')).toEqual({
      message: 'Found 2 models for this key.',
      selected: 'gpt-6-luna'
    })
  })

  it('says so, and keeps the current model, when the list could not be saved', () => {
    const settled = settleRefresh(found, null, 'gpt-5.2')
    expect(settled.selected).toBe('gpt-5.2')
    expect(settled.message).toMatch(/could not save the list/i)
  })

  it('keeps the current model when the saved list does not contain the chosen one', () => {
    expect(settleRefresh(found, ['gpt-5.2'], 'gpt-5.2').selected).toBe('gpt-5.2')
  })
})
