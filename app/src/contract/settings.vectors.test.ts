import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { MAX_PATH_LENGTH } from '../shared/source-path'
import { decode } from './tasks.vectors.codec'
import { ALL_SETTINGS_KEYS, settingsVectors } from './settings.vectors.inputs'

interface RecordedVector {
  id: string
  op: 'save' | 'provider'
  accepted: boolean
  output?: unknown
  legacyMessage?: string
}

const file = JSON.parse(
  readFileSync(fileURLToPath(new URL('./settings.vectors.expected.json', import.meta.url)), 'utf8')
) as { header: { recordedFrom: string; baseSha: string }; vectors: RecordedVector[] }

const recorded = file.vectors
const byId = new Map(recorded.map((vector) => [vector.id, vector]))
const idsOf = (vectors: { id: string }[]): string[] => vectors.map((vector) => vector.id)

describe('the settings oracle recorded from the pre-change validators', () => {
  it('records exactly one expectation for every authored vector, with unique ids', () => {
    expect(idsOf(recorded)).toEqual(idsOf(settingsVectors))
    expect(recorded.map((vector) => vector.op)).toEqual(settingsVectors.map((vector) => vector.op))
    expect(new Set(idsOf(settingsVectors)).size).toBe(settingsVectors.length)
  })

  it('names the commits it was recorded from', () => {
    expect(file.header.recordedFrom).toMatch(/^[0-9a-f]{40}$/)
    expect(file.header.baseSha).toMatch(/^[0-9a-f]{40}$/)
  })

  it('keeps ids that cannot be mistaken for a channel name', () => {
    for (const vector of settingsVectors) {
      expect(vector.id, vector.id).toMatch(/^(save|provider): /)
    }
  })

  it('has accepted and rejected examples for both operations', () => {
    for (const op of ['save', 'provider'] as const) {
      const ofOp = recorded.filter((vector) => vector.op === op)
      expect(
        ofOp.some((vector) => vector.accepted),
        `${op} accepted`
      ).toBe(true)
      expect(
        ofOp.some((vector) => !vector.accepted),
        `${op} rejected`
      ).toBe(true)
    }
  })

  it('covers every key of the old validator with an accepted and a rejected value', () => {
    for (const key of ALL_SETTINGS_KEYS) {
      const own = recorded.filter(
        (vector) => vector.op === 'save' && vector.id.startsWith(`save: ${key} `)
      )
      expect(
        own.some((vector) => vector.accepted),
        `${key} accepted`
      ).toBe(true)
      expect(
        own.some((vector) => !vector.accepted),
        `${key} rejected`
      ).toBe(true)
    }
  })

  it('lists exactly the keys the old validator allows, proved by its own answers', () => {
    // An allowed key with an explicit undefined fails on its value; an unknown key fails on the key itself.
    for (const key of ALL_SETTINGS_KEYS) {
      const vector = byId.get(`save: ${key} explicit undefined`)
      expect(vector?.accepted, key).toBe(false)
      expect(vector?.legacyMessage, key).not.toMatch(/^Invalid settings key/)
    }
    expect(byId.get('save: only an unknown key')?.legacyMessage).toMatch(/^Invalid settings key/)
  })

  it('keeps the vectors that distinguish a strict schema from a lenient one', () => {
    const ids = new Set(idsOf(settingsVectors))
    const required = [
      // patch shapes and prototypes
      'save: undefined',
      'save: null',
      'save: string',
      'save: number',
      'save: empty array',
      'save: Date instance',
      'save: Map instance',
      'save: class instance with a valid own field',
      'save: null-prototype object with a valid key',
      'save: symbol key is ignored',
      'save: own __proto__ key',
      'save: inherited valid key only',
      'save: inherited valid key beside an own key',
      'save: inherited invalid key only',
      'save: constructor as a key',
      // bounds
      `save: notesRoot at ${MAX_PATH_LENGTH} characters`,
      `save: notesRoot at ${MAX_PATH_LENGTH + 1} characters`,
      'save: notesRoot with a NUL',
      'save: model 200 characters',
      'save: model 201 characters',
      'save: model padded is kept untrimmed',
      'save: model trimmed length 1 with a long raw length',
      'save: openaiKey padded is trimmed',
      'save: openaiKey whitespace only',
      'save: openaiKey 10000 characters',
      'save: ticketLinkBase https 300 characters',
      'save: ticketLinkBase https 301 characters',
      'save: ticketLinkBase credentials',
      'save: ticketLinkBase http',
      // nested shapes
      'save: cloudAnswersAcknowledgement with an extra key',
      'save: cloudAnswersAcknowledgement with an own __proto__ key',
      'save: cloudAnswersAcknowledgement missing model',
      'save: cloudAnswersAcknowledgement empty model',
      'save: deleteProviderKeys sparse',
      'save: deleteProviderKeys repeated',
      'save: deleteProviderKeys 100 long',
      'save: deleteProviderKeys unknown provider',
      // the provider of validate-key and list-models
      'provider: openai',
      'provider: unknown',
      'provider: undefined',
      'provider: object with a provider field'
    ]
    for (const id of required) expect(ids.has(id), id).toBe(true)

    const inputs = settingsVectors.map((vector) => vector.input)
    const objects = inputs.filter(
      (input): input is Record<string, unknown> => typeof input === 'object' && input !== null
    )
    expect(objects.some((object) => Object.keys(object).includes('__proto__'))).toBe(true)
    expect(objects.some((object) => Object.getOwnPropertySymbols(object).length > 0)).toBe(true)
    expect(objects.some((object) => Object.getPrototypeOf(object) === null)).toBe(true)
    expect(objects.some((object) => Object.values(object).includes(undefined))).toBe(true)
    expect(
      objects.some((object) => Object.values(object).some((value) => Number.isNaN(value)))
    ).toBe(true)
    expect(
      inputs.some((input) => Array.isArray(input) && Object.keys(input).length !== input.length)
    ).toBe(false)
    expect(
      objects.some((object) =>
        Object.values(object).some(
          (value) => Array.isArray(value) && Object.keys(value).length !== value.length
        )
      )
    ).toBe(true)
    expect(inputs).toContain(undefined)
    expect(inputs).toContain(null)
  })

  it('captured the behaviors the new schema has to decide on', () => {
    // These facts come from the old validator and make a re-recording from the wrong code noticeable.
    const accepted = (id: string): unknown => {
      const vector = byId.get(id)
      expect(vector?.accepted, id).toBe(true)
      return decode(vector?.output)
    }

    expect(accepted('save: inherited valid key only')).toStrictEqual({ colorMode: 'dark' })
    expect(accepted('save: Date instance')).toStrictEqual({})
    expect(accepted('save: model padded is kept untrimmed')).toStrictEqual({ model: '  gpt-5.2  ' })
    expect(accepted('save: openaiKey padded is trimmed')).toStrictEqual({
      openaiKey: 'synthetic-key-value'
    })

    const acknowledgement = accepted('save: cloudAnswersAcknowledgement with an extra key') as {
      cloudAnswersAcknowledgement: Record<string, unknown>
    }
    expect(acknowledgement.cloudAnswersAcknowledgement.extra).toBe('x')

    const sparse = accepted('save: deleteProviderKeys sparse') as { deleteProviderKeys: unknown[] }
    expect(sparse.deleteProviderKeys).toHaveLength(2)
    expect(0 in sparse.deleteProviderKeys).toBe(false)

    expect(byId.get('save: own __proto__ key')?.accepted).toBe(false)
    expect(byId.get('provider: object with a provider field')?.accepted).toBe(false)
  })
})
