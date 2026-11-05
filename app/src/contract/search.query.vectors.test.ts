import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { requestId as requestIdSchema, searchQuery } from './primitives'
import { cancel, query } from './search'
import { ACCEPTED_DEVIATIONS, NO_LONGER_REPRESENTABLE } from './search.query.vectors.deviations'
import {
  SEARCH_QUERY_VECTOR_OPS,
  searchQueryVectors,
  type SearchQueryVectorOp
} from './search.query.vectors.inputs'
import { decode } from './tasks.vectors.codec'

interface RecordedVector {
  id: string
  op: SearchQueryVectorOp
  accepted: boolean
  output?: unknown
  legacyMessage?: string
}

const file = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./search.query.vectors.expected.json', import.meta.url)),
    'utf8'
  )
) as { header: { recordedFrom: string; baseSha: string }; vectors: RecordedVector[] }

const recorded = file.vectors
const byId = new Map(recorded.map((vector) => [vector.id, vector]))
const idsOf = (vectors: { id: string }[]): string[] => vectors.map((vector) => vector.id)

// The query text the options are paired with when the old two arguments are written as the new object.
const QUERY_TEXT = 'jira plans'

type Mapped = { kind: 'input'; input: Record<string, unknown> } | { kind: 'unrepresentable' }

// `query(q, options)` is now `query({ query, ...options })`: no options is just the query, a plain object is
// spread in, and anything else has no new equivalent.
function mapOptions(options: unknown): Mapped {
  if (options === undefined || options === null)
    return { kind: 'input', input: { query: QUERY_TEXT } }
  if (typeof options === 'object' && !Array.isArray(options)) {
    const prototype = Object.getPrototypeOf(options) as unknown
    // An own `query` key would now replace the query text instead of being an unknown option.
    if ((prototype === Object.prototype || prototype === null) && !('query' in options)) {
      return { kind: 'input', input: { query: QUERY_TEXT, ...options } }
    }
  }
  return { kind: 'unrepresentable' }
}

describe('the search query oracle recorded from the pre-change validators', () => {
  it('records exactly one expectation for every authored vector, with unique ids', () => {
    expect(idsOf(recorded)).toEqual(idsOf(searchQueryVectors))
    expect(recorded.map((vector) => vector.op)).toEqual(
      searchQueryVectors.map((vector) => vector.op)
    )
    expect(new Set(idsOf(searchQueryVectors)).size).toBe(searchQueryVectors.length)
  })

  it('names the commit it was recorded from', () => {
    expect(file.header.recordedFrom).toMatch(/^[0-9a-f]{40}$/)
    expect(file.header.baseSha).toBe(file.header.recordedFrom)
    expect(file.header.baseSha.startsWith('1bffddd')).toBe(true)
  })

  it('keeps ids that cannot be mistaken for a channel name', () => {
    for (const vector of searchQueryVectors) {
      expect(vector.id, vector.id).toMatch(/^(searchQuery|searchOptions|requestId): /)
    }
  })

  it('has accepted and rejected examples for every rule', () => {
    for (const op of SEARCH_QUERY_VECTOR_OPS) {
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

  it('keeps the vectors that distinguish a strict schema from a lenient one', () => {
    const ids = new Set(idsOf(searchQueryVectors))
    const required = [
      // the query text
      'searchQuery: empty',
      'searchQuery: whitespace only',
      'searchQuery: 2000 characters',
      'searchQuery: 2001 characters',
      'searchQuery: 2000 characters padded both sides to over 2000',
      'searchQuery: 2001 characters padded both sides',
      'searchQuery: 1001 emoji (2002 units)',
      'searchQuery: interior whitespace is kept',
      'searchQuery: zero-width space is not trimmed',
      'searchQuery: explicit undefined',
      'searchQuery: String object',
      // the options argument
      'searchOptions: undefined',
      'searchOptions: null',
      'searchOptions: empty object',
      'searchOptions: both valid',
      'searchOptions: unknown key',
      'searchOptions: own __proto__ key',
      'searchOptions: symbol key beside valid keys is ignored',
      'searchOptions: null-prototype object with valid keys',
      'searchOptions: retrievalMode explicit undefined key',
      'searchOptions: answerMode explicit undefined key',
      'searchOptions: both keys explicit undefined',
      'searchOptions: retrievalMode auto',
      'searchOptions: retrievalMode upper-case auto',
      'searchOptions: retrievalMode an answer mode',
      'searchOptions: answerMode local-only',
      'searchOptions: answerMode upper-case settings',
      'searchOptions: answerMode a retrieval mode',
      'searchOptions: class instance with valid own fields',
      'searchOptions: inherited retrievalMode only',
      'searchOptions: empty array',
      // the request id
      'requestId: typical v4',
      'requestId: upper-case v4',
      'requestId: version 0',
      'requestId: version 1',
      'requestId: version 5',
      'requestId: version 6',
      'requestId: version 7',
      'requestId: variant 8',
      'requestId: variant b',
      'requestId: variant 7',
      'requestId: variant c',
      'requestId: variant 0',
      'requestId: one character short',
      'requestId: one character long',
      'requestId: no hyphens',
      'requestId: braces',
      'requestId: trailing newline',
      'requestId: an empty request id as the not-ready error carries',
      'requestId: String object',
      'requestId: explicit undefined'
    ]
    for (const id of required) expect(ids.has(id), id).toBe(true)

    const inputs = searchQueryVectors.map((vector) => vector.input)
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

  it('captured the behaviors the new schemas have to decide on', () => {
    // These facts come from the old validators and make a re-recording from the wrong code noticeable.
    const accepted = (id: string): unknown => {
      const vector = byId.get(id)
      expect(vector?.accepted, id).toBe(true)
      return decode(vector?.output)
    }

    expect(accepted('searchQuery: 2000 characters padded both sides to over 2000')).toBe(
      'q'.repeat(2000)
    )
    expect(accepted('searchQuery: interior whitespace is kept')).toBe('a  b\tc\nd')
    expect(accepted('searchQuery: zero-width space is not trimmed')).toBe('​')
    expect(accepted('searchQuery: 1000 emoji (2000 units)')).toHaveLength(2000)
    expect(accepted('searchOptions: undefined')).toStrictEqual({})
    expect(accepted('searchOptions: null')).toStrictEqual({})
    expect(accepted('searchOptions: both valid, answerMode first')).toStrictEqual({
      retrievalMode: 'auto',
      answerMode: 'local-only'
    })
    expect(accepted('searchOptions: symbol key beside valid keys is ignored')).toStrictEqual({
      retrievalMode: 'keyword'
    })
    expect(accepted('requestId: upper-case v4')).toBe('3F9C1D2E-7A4B-4C8E-9D1F-0A2B3C4D5E6F')

    for (const id of [
      'searchQuery: empty',
      'searchQuery: whitespace only',
      'searchQuery: 2001 characters',
      'searchQuery: 2001 characters padded both sides',
      'searchQuery: 1001 emoji (2002 units)',
      'searchQuery: number',
      'searchQuery: explicit undefined',
      'searchOptions: unknown key',
      'searchOptions: own __proto__ key',
      'searchOptions: retrievalMode explicit undefined key',
      'searchOptions: answerMode explicit undefined key',
      'searchOptions: both keys explicit undefined',
      'searchOptions: retrievalMode upper-case auto',
      'searchOptions: retrievalMode an answer mode',
      'searchOptions: answerMode upper-case settings',
      'searchOptions: answerMode a retrieval mode',
      'searchOptions: retrievalMode null key',
      'requestId: nil uuid',
      'requestId: max uuid',
      'requestId: version 0',
      'requestId: version 6',
      'requestId: version 7',
      'requestId: variant 7',
      'requestId: variant c',
      'requestId: variant 0',
      'requestId: one character short',
      'requestId: no hyphens',
      'requestId: braces',
      'requestId: trailing newline',
      'requestId: leading newline',
      'requestId: an empty request id as the not-ready error carries',
      'requestId: String object',
      'requestId: explicit undefined'
    ]) {
      expect(byId.get(id)?.accepted, id).toBe(false)
    }
    // Versions 1 to 5 and variants 8, 9, a and b, in both cases.
    for (const version of ['1', '2', '3', '4', '5']) {
      expect(byId.get(`requestId: version ${version}`)?.accepted).toBe(true)
      expect(byId.get(`requestId: version ${version} upper-case`)?.accepted).toBe(true)
    }
    for (const variant of ['8', '9', 'a', 'b']) {
      expect(byId.get(`requestId: variant ${variant}`)?.accepted).toBe(true)
      expect(byId.get(`requestId: variant ${variant} upper-case`)?.accepted).toBe(true)
    }
  })
})

describe('search.query text against the golden vectors recorded from the pre-change validator', () => {
  const vectors = searchQueryVectors
    .map((vector, index) => [vector.id, vector, recorded[index]] as const)
    .filter(([, vector]) => vector.op === 'searchQuery')

  it.each(vectors)('%s', (_id, vector, expected) => {
    const alone = searchQuery.safeParse(vector.input)
    const inObject = query.input.safeParse({ query: vector.input })
    expect(alone.success, `accept/reject for ${vector.id}`).toBe(expected.accepted)
    expect(inObject.success, `accept/reject inside the input object for ${vector.id}`).toBe(
      expected.accepted
    )
    if (expected.accepted && alone.success && inObject.success) {
      expect(alone.data).toBe(decode(expected.output))
      expect(inObject.data).toStrictEqual({ query: decode(expected.output) })
    }
  })
})

describe('search.query options against the golden vectors recorded from the pre-change validator', () => {
  const vectors = searchQueryVectors
    .map((vector, index) => [vector.id, vector, recorded[index]] as const)
    .filter(([, vector]) => vector.op === 'searchOptions')

  it('lists exactly the values that cannot be written as the new input, each with a reason', () => {
    const unrepresentable = vectors
      .filter(([, vector]) => mapOptions(vector.input).kind === 'unrepresentable')
      .map(([id]) => id)
    expect(unrepresentable.sort()).toEqual(Object.keys(NO_LONGER_REPRESENTABLE).sort())
    for (const [id, reason] of Object.entries(NO_LONGER_REPRESENTABLE)) {
      expect(reason, id).not.toBe('')
    }
  })

  it('only drops values that were rejected, or objects that cannot arrive over structured clone', () => {
    for (const [id, vector, expected] of vectors) {
      if (mapOptions(vector.input).kind !== 'unrepresentable') continue
      if (expected.accepted) {
        // The old validator accepted it: it must be an object with another prototype, never a primitive.
        expect(typeof vector.input, id).toBe('object')
        expect(Array.isArray(vector.input), id).toBe(false)
      }
    }
  })

  it.each(vectors)('%s', (id, vector, expected) => {
    const mapped = mapOptions(vector.input)
    if (mapped.kind === 'unrepresentable') {
      expect(NO_LONGER_REPRESENTABLE[id], `no longer representable: ${id}`).toBeDefined()
      return
    }
    const result = query.input.safeParse(mapped.input)
    const deviation = ACCEPTED_DEVIATIONS[id]
    if (deviation) {
      expect(expected.accepted, 'the legacy validator accepted this input').toBe(true)
      expect(result.success, deviation.reason).toBe(deviation.accepted)
      return
    }
    expect(result.success, `accept/reject for ${id}`).toBe(expected.accepted)
    if (expected.accepted && result.success) {
      expect(result.data).toStrictEqual({
        query: QUERY_TEXT,
        ...(decode(expected.output) as object)
      })
    }
  })
})

describe('search.cancel request id against the golden vectors recorded from the pre-change validator', () => {
  const vectors = searchQueryVectors
    .map((vector, index) => [vector.id, vector, recorded[index]] as const)
    .filter(([, vector]) => vector.op === 'requestId')

  it.each(vectors)('%s', (_id, vector, expected) => {
    const alone = requestIdSchema.safeParse(vector.input)
    const inObject = cancel.input.safeParse({ requestId: vector.input })
    expect(alone.success, `accept/reject for ${vector.id}`).toBe(expected.accepted)
    expect(inObject.success, `accept/reject inside the input object for ${vector.id}`).toBe(
      expected.accepted
    )
    if (expected.accepted && inObject.success) {
      expect(inObject.data).toStrictEqual({ requestId: decode(expected.output) })
    }
  })
})
