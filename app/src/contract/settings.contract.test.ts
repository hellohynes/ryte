import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import type { ZodSafeParseResult } from 'zod'

import { ContractInputError, parseOperationInput } from './define'
import { getState, listModels, save, validateKey } from './settings'
import { decode } from './tasks.vectors.codec'
import { ACCEPTED_DEVIATIONS } from './settings.vectors.deviations'
import { settingsVectors } from './settings.vectors.inputs'

interface RecordedVector {
  id: string
  op: 'save' | 'provider'
  accepted: boolean
  output?: unknown
}

const recorded = (
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('./settings.vectors.expected.json', import.meta.url)),
      'utf8'
    )
  ) as { vectors: RecordedVector[] }
).vectors

/** The provider vectors recorded a bare value; the operations now take it in an object. */
const apply = (op: 'save' | 'provider', input: unknown): ZodSafeParseResult<unknown> =>
  op === 'save' ? save.input.safeParse(input) : validateKey.input.safeParse({ provider: input })

describe('settings contract against the golden vectors recorded from the pre-change validators', () => {
  it.each(settingsVectors.map((vector, index) => [vector.id, vector, recorded[index]] as const))(
    '%s',
    (_id, vector, expected) => {
      const result = apply(vector.op, vector.input)
      const deviation = ACCEPTED_DEVIATIONS[vector.id]
      if (deviation) {
        expect(expected.accepted, 'the legacy validator accepted this input').toBe(true)
        expect(result.success, deviation.reason).toBe(deviation.accepted)
        return
      }
      expect(result.success, `accept/reject for ${vector.id}`).toBe(expected.accepted)
      if (expected.accepted && result.success) {
        const want = decode(expected.output)
        expect(
          vector.op === 'save' ? result.data : (result.data as { provider: unknown }).provider
        ).toStrictEqual(want)
      }
    }
  )
})

describe('settings operations', () => {
  const operations = [getState, save, validateKey, listModels]

  it('validates each operation example against its own schemas', () => {
    for (const operation of operations) {
      expect(operation.input.safeParse(operation.example.input).success, operation.channel).toBe(
        true
      )
      expect(operation.output.safeParse(operation.example.output).success, operation.channel).toBe(
        true
      )
    }
  })

  it('keeps the wire channel names', () => {
    expect(operations.map((operation) => operation.channel)).toEqual([
      'settings:get-state',
      'settings:save',
      'settings:validate-key',
      'settings:list-models'
    ])
  })

  it('keeps no key-shaped value in an example or a description', () => {
    for (const operation of operations) {
      const text = JSON.stringify([operation.example, operation.description])
      expect(text, operation.channel).not.toMatch(/sk-|[A-Za-z0-9_-]{32,}/)
    }
  })

  it('takes no input for get-state', () => {
    expect(getState.input.safeParse(undefined).success).toBe(true)
    expect(getState.input.safeParse({}).success).toBe(false)
    expect(getState.input.safeParse('openai').success).toBe(false)
  })

  it.each([
    ['validate-key', validateKey],
    ['list-models', listModels]
  ] as const)('takes a strict { provider } object for %s', (_name, operation) => {
    for (const provider of ['anthropic', 'openai', 'gemini']) {
      expect(operation.input.safeParse({ provider }).success, provider).toBe(true)
    }
    // The wire shape changed on purpose (plan D1): a bare provider, an extra key and a missing field are rejected.
    expect(operation.input.safeParse('openai').success, 'a bare provider').toBe(false)
    expect(
      operation.input.safeParse({ provider: 'openai', extra: 1 }).success,
      'an extra key'
    ).toBe(false)
    expect(operation.input.safeParse({}).success, 'no provider').toBe(false)
    expect(operation.input.safeParse(undefined).success, 'no input').toBe(false)
    expect(operation.input.safeParse({ provider: 'bogus' }).success, 'an unknown provider').toBe(
      false
    )
  })

  it('returns the trimmed key and the untrimmed model from a valid patch', () => {
    expect(
      parseOperationInput('settings.save', save.input, {
        openaiKey: '  synthetic-key-value  ',
        answerModel: '  gpt-5.2  '
      })
    ).toStrictEqual({ openaiKey: 'synthetic-key-value', answerModel: '  gpt-5.2  ' })
  })
})

describe('rejected settings input', () => {
  it('names the operation and the fields, never a value, even when a secret is in the rejected patch', () => {
    const secret = 'synthetic-secret-value-123'

    for (const input of [
      { openaiKey: secret, colorMode: 'secret-neon' },
      { anthropicKey: '   ', geminiKey: secret, notesRoot: 'relative-secret' },
      { [secret]: 1 },
      {
        cloudAnswersAcknowledgement: {
          acknowledgedAt: secret,
          provider: 'secret-provider',
          model: ''
        }
      },
      { deleteProviderKeys: ['openai', secret] }
    ]) {
      let thrown: unknown
      try {
        parseOperationInput('settings.save', save.input, input)
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(ContractInputError)
      const message = (thrown as Error).message
      expect(message.startsWith('Invalid settings.save input')).toBe(true)
      expect(message).not.toMatch(/secret|synthetic|relative/)
    }
  })

  it('names the provider field for the key operations', () => {
    let thrown: unknown
    try {
      parseOperationInput('settings.validateKey', validateKey.input, {
        provider: 'secret-provider'
      })
    } catch (error) {
      thrown = error
    }
    expect((thrown as Error).message).toBe('Invalid settings.validateKey input: provider')
  })
})
