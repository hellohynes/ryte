import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { MAX_PATH_LENGTH } from '../shared/source-path'
import { checkSnapshotFreshness } from './search'
import { ACCEPTED_DEVIATIONS } from './search.vectors.deviations'
import { searchVectors } from './search.vectors.inputs'
import { decode } from './tasks.vectors.codec'

interface RecordedVector {
  id: string
  op: 'freshness'
  accepted: boolean
  output?: unknown
  legacyMessage?: string
}

const file = JSON.parse(
  readFileSync(fileURLToPath(new URL('./search.vectors.expected.json', import.meta.url)), 'utf8')
) as { header: { recordedFrom: string; baseSha: string }; vectors: RecordedVector[] }

const recorded = file.vectors
const byId = new Map(recorded.map((vector) => [vector.id, vector]))
const idsOf = (vectors: { id: string }[]): string[] => vectors.map((vector) => vector.id)

describe('the search oracle recorded from the pre-change validator', () => {
  it('records exactly one expectation for every authored vector, with unique ids', () => {
    expect(idsOf(recorded)).toEqual(idsOf(searchVectors))
    expect(recorded.map((vector) => vector.op)).toEqual(searchVectors.map((vector) => vector.op))
    expect(new Set(idsOf(searchVectors)).size).toBe(searchVectors.length)
  })

  it('names the commit it was recorded from', () => {
    expect(file.header.recordedFrom).toMatch(/^[0-9a-f]{40}$/)
    expect(file.header.baseSha).toBe(file.header.recordedFrom)
    expect(file.header.baseSha.startsWith('68bf229')).toBe(true)
  })

  it('keeps ids that cannot be mistaken for a channel name', () => {
    for (const vector of searchVectors) expect(vector.id, vector.id).toMatch(/^freshness: /)
  })

  it('has accepted and rejected examples', () => {
    expect(recorded.some((vector) => vector.accepted)).toBe(true)
    expect(recorded.some((vector) => !vector.accepted)).toBe(true)
  })

  it('keeps the vectors that distinguish a strict schema from a lenient one', () => {
    const ids = new Set(idsOf(searchVectors))
    const required = [
      // shapes and prototypes
      'freshness: undefined',
      'freshness: null',
      'freshness: empty array',
      'freshness: array holding a valid input',
      'freshness: class instance with valid own fields',
      'freshness: null-prototype object with valid keys',
      'freshness: symbol key beside valid keys is ignored',
      'freshness: own __proto__ key with valid keys',
      'freshness: every key inherited',
      'freshness: valid own keys beside an inherited unknown key',
      // the key set
      'freshness: valid input with an unknown key',
      'freshness: query missing',
      'freshness: retrievalMode missing',
      'freshness: generatedAt missing',
      'freshness: sourcePaths missing',
      'freshness: query explicit undefined key',
      'freshness: retrievalMode explicit undefined key',
      'freshness: generatedAt explicit undefined key',
      'freshness: sourcePaths explicit undefined key',
      // retrievalMode
      'freshness: retrievalMode auto',
      'freshness: retrievalMode keyword',
      'freshness: retrievalMode hybrid',
      'freshness: retrievalMode upper-case auto',
      'freshness: retrievalMode empty',
      'freshness: retrievalMode an answer mode',
      // generatedAt
      'freshness: generatedAt zero',
      'freshness: generatedAt negative zero',
      'freshness: generatedAt negative one',
      'freshness: generatedAt NaN',
      'freshness: generatedAt infinity',
      'freshness: generatedAt negative infinity',
      'freshness: generatedAt bigint',
      'freshness: generatedAt numeric string',
      // sourcePaths
      'freshness: sourcePaths 100 entries',
      'freshness: sourcePaths 101 entries',
      'freshness: sourcePaths 100 copies of one path',
      'freshness: sourcePaths 101 copies of one path',
      'freshness: sourcePaths duplicates keep the first occurrence order',
      'freshness: sourcePaths same file under two spellings',
      'freshness: sourcePaths empty entry',
      `freshness: sourcePaths entry of ${MAX_PATH_LENGTH} characters`,
      `freshness: sourcePaths entry of ${MAX_PATH_LENGTH + 1} characters`,
      'freshness: sourcePaths number entry',
      'freshness: sourcePaths explicit undefined entry',
      'freshness: sourcePaths sparse array with a hole',
      'freshness: sourcePaths null',
      // query
      'freshness: query empty',
      'freshness: query whitespace only',
      'freshness: query one character',
      'freshness: query 2000 characters',
      'freshness: query 2001 characters',
      'freshness: query 2000 characters with leading space',
      'freshness: query 2000 characters padded both sides to over 2000',
      'freshness: query 2001 characters padded both sides',
      'freshness: query 1000 emoji (2000 units)',
      'freshness: query 1001 emoji (2002 units)',
      'freshness: query zero-width space is not trimmed',
      'freshness: query number',
      'freshness: query String object'
    ]
    for (const id of required) expect(ids.has(id), id).toBe(true)

    const inputs = searchVectors.map((vector) => vector.input)
    const objects = inputs.filter(
      (input): input is Record<string, unknown> => typeof input === 'object' && input !== null
    )
    expect(objects.some((object) => Object.keys(object).includes('__proto__'))).toBe(true)
    expect(objects.some((object) => Object.getOwnPropertySymbols(object).length > 0)).toBe(true)
    expect(objects.some((object) => Object.getPrototypeOf(object) === null)).toBe(true)
    expect(objects.some((object) => Object.values(object).includes(undefined))).toBe(true)
    expect(inputs).toContain(undefined)
    expect(inputs).toContain(null)
  })

  it('captured the behaviors the new schema has to decide on', () => {
    // These facts come from the old validator and make a re-recording from the wrong code noticeable.
    const accepted = (id: string): Record<string, unknown> => {
      const vector = byId.get(id)
      expect(vector?.accepted, id).toBe(true)
      return decode(vector?.output) as Record<string, unknown>
    }

    expect(accepted('freshness: sourcePaths duplicates keep the first occurrence order')).toEqual({
      query: 'jira plans',
      retrievalMode: 'keyword',
      generatedAt: 100,
      sourcePaths: ['b.md', 'a.md', 'c.md']
    })
    expect(accepted('freshness: sourcePaths 100 copies of one path').sourcePaths).toEqual(['a.md'])
    expect(
      accepted('freshness: sourcePaths same file under two spellings').sourcePaths
    ).toHaveLength(4)
    expect(accepted('freshness: query 2000 characters padded both sides to over 2000').query).toBe(
      'q'.repeat(2000)
    )
    expect(accepted('freshness: query interior whitespace is kept').query).toBe('a  b\tc\nd')
    expect(accepted('freshness: query zero-width space is not trimmed').query).toBe('​')
    expect(accepted('freshness: query 1000 emoji (2000 units)').query).toHaveLength(2000)
    expect(Object.is(accepted('freshness: generatedAt negative zero').generatedAt, -0)).toBe(true)
    expect(accepted('freshness: every key inherited').retrievalMode).toBe('keyword')
    // The old validator let a hole through `every` and then put `undefined` in the list.
    expect(accepted('freshness: sourcePaths sparse array with a hole').sourcePaths).toEqual([
      undefined,
      'a.md'
    ])

    for (const id of [
      'freshness: valid input with an unknown key',
      'freshness: query missing',
      'freshness: query explicit undefined key',
      'freshness: retrievalMode explicit undefined key',
      'freshness: generatedAt explicit undefined key',
      'freshness: sourcePaths explicit undefined key',
      'freshness: retrievalMode upper-case auto',
      'freshness: retrievalMode empty',
      'freshness: retrievalMode an answer mode',
      'freshness: generatedAt negative one',
      'freshness: generatedAt NaN',
      'freshness: generatedAt infinity',
      'freshness: generatedAt bigint',
      'freshness: generatedAt numeric string',
      'freshness: sourcePaths 101 entries',
      'freshness: sourcePaths 101 copies of one path',
      'freshness: sourcePaths empty entry',
      `freshness: sourcePaths entry of ${MAX_PATH_LENGTH + 1} characters`,
      'freshness: sourcePaths explicit undefined entry',
      'freshness: sourcePaths null',
      'freshness: query empty',
      'freshness: query whitespace only',
      'freshness: query 2001 characters',
      'freshness: query 2001 characters padded both sides',
      'freshness: query 1001 emoji (2002 units)',
      'freshness: query number',
      'freshness: query String object'
    ]) {
      expect(byId.get(id)?.accepted, id).toBe(false)
    }
  })
})

describe('search.checkSnapshotFreshness against the golden vectors recorded from the pre-change validator', () => {
  it.each(searchVectors.map((vector, index) => [vector.id, vector, recorded[index]] as const))(
    '%s',
    (_id, vector, expected) => {
      const result = checkSnapshotFreshness.input.safeParse(vector.input)
      const deviation = ACCEPTED_DEVIATIONS[vector.id]
      if (deviation) {
        expect(expected.accepted, 'the legacy validator accepted this input').toBe(true)
        expect(result.success, deviation.reason).toBe(deviation.accepted)
        return
      }
      expect(result.success, `accept/reject for ${vector.id}`).toBe(expected.accepted)
      if (expected.accepted && result.success) {
        expect(result.data).toStrictEqual(decode(expected.output))
      }
    }
  )
})
