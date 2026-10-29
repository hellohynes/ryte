import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'

import { acknowledgementForSave } from './settings-acknowledgement'

describe('acknowledgementForSave', () => {
  it('copies a current reactive acknowledgement into an IPC-cloneable value', () => {
    const acknowledgement = reactive({
      acknowledgedAt: '2026-10-23T12:00:00.000Z',
      provider: 'openai' as const,
      model: 'gpt-5.2'
    })

    const saved = acknowledgementForSave(acknowledgement, 'openai', 'gpt-5.2')

    expect(saved).toEqual(acknowledgement)
    expect(saved).not.toBe(acknowledgement)
    expect(() => structuredClone(saved)).not.toThrow()
  })

  it('creates a new acknowledgement when the provider or model changes', () => {
    expect(
      acknowledgementForSave(
        { acknowledgedAt: '2026-10-23T12:00:00.000Z', provider: 'openai', model: 'gpt-5.2' },
        'openai',
        'gpt-6-luna',
        () => '2026-10-23T13:00:00.000Z'
      )
    ).toEqual({
      acknowledgedAt: '2026-10-23T13:00:00.000Z',
      provider: 'openai',
      model: 'gpt-6-luna'
    })
  })
})
