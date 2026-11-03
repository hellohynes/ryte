import { describe, expect, it } from 'vitest'

import type { EmbeddingStatus } from '../../../contract/indexer'
import { clearAndRebuildConfirm, embeddingLine, formatRetryTime } from './embedding-model'

const TZ = 'America/New_York'
// 3:42 PM in New York.
const RETRY_AT = '2026-11-03T20:42:00.000Z'

const status = (over: Partial<EmbeddingStatus>): EmbeddingStatus => ({
  state: 'idle',
  total: 3200,
  done: 3200,
  pending: 0,
  ...over
})

describe('formatRetryTime', () => {
  it('gives a clock time in the viewer zone', () => {
    expect(formatRetryTime(RETRY_AT, TZ)).toBe('3:42 PM')
    expect(formatRetryTime('2026-11-03T14:05:00.000Z', TZ)).toBe('9:05 AM')
  })
})

describe('embeddingLine', () => {
  it.each([
    [
      'notes being added',
      status({ state: 'running', done: 120, pending: 3080 }),
      'Smart search: adding to 120 of 3,200 notes.'
    ],
    ['all notes done', status({}), 'Smart search is ready.'],
    [
      'some notes left keyword-only',
      status({ done: 3197, pending: 3 }),
      'Smart search is ready. 3 notes are searchable by keywords only for now.'
    ],
    [
      'one note left keyword-only',
      status({ done: 3199, pending: 1 }),
      'Smart search is ready. 1 note is searchable by keywords only for now.'
    ],
    ['no notes at all', status({ total: 0, done: 0, pending: 0 }), 'Smart search is ready.'],
    [
      'paused, no connection',
      status({ state: 'paused', pending: 10, reason: 'offline', retryAt: RETRY_AT }),
      'Smart search is paused: no connection. Trying again at 3:42 PM.'
    ],
    [
      'paused, slowed down',
      status({ state: 'paused', pending: 10, reason: 'rate-limit', retryAt: RETRY_AT }),
      'Smart search is paused: OpenAI asked Ryte to slow down. Trying again at 3:42 PM.'
    ],
    [
      'paused, OpenAI had a problem',
      status({ state: 'paused', pending: 10, reason: 'service', retryAt: RETRY_AT }),
      'Smart search is paused: OpenAI had a problem. Trying again at 3:42 PM.'
    ],
    [
      'paused, key or model refused',
      status({ state: 'paused', pending: 10, reason: 'auth' }),
      'Smart search is paused: OpenAI refused the key or model. Check AI tools.'
    ],
    [
      'on, no key saved',
      status({ state: 'off', total: 0, done: 0, pending: 0, reason: 'no-key' }),
      'Smart search is on, but there is no OpenAI key. Add one in AI tools.'
    ],
    [
      'on, no saved confirmation',
      status({ state: 'off', total: 0, done: 0, pending: 0, reason: 'no-agreement' }),
      'Smart search needs your confirmation. Turn it off and on again in AI tools.'
    ]
  ])('says, for %s: %s', (_name, input, expected) => {
    expect(embeddingLine(input, true, TZ)).toBe(expected)
  })

  it('says nothing when smart search is off, whatever main reports', () => {
    for (const reported of [
      status({ state: 'running', done: 1, pending: 3199 }),
      status({ state: 'paused', pending: 5, reason: 'auth' }),
      status({ state: 'off', total: 0, done: 0, pending: 0, reason: 'no-key' }),
      status({})
    ]) {
      expect(embeddingLine(reported, false, TZ)).toBeNull()
    }
  })

  it('says nothing before main has said anything, and for an off state with no reason', () => {
    expect(embeddingLine(null, true, TZ)).toBeNull()
    expect(
      embeddingLine(status({ state: 'off', total: 0, done: 0, pending: 0 }), true, TZ)
    ).toBeNull()
  })

  it('gives no retry time for a refused key, and no time it was not given', () => {
    expect(
      embeddingLine(
        status({ state: 'paused', pending: 4, reason: 'auth', retryAt: RETRY_AT }),
        true,
        TZ
      )
    ).not.toMatch(/Trying again/)
    expect(
      embeddingLine(status({ state: 'paused', pending: 4, reason: 'offline' }), true, TZ)
    ).toBe('Smart search is paused: no connection.')
    expect(embeddingLine(status({ state: 'paused', pending: 4 }), true, TZ)).toBe(
      'Smart search is paused.'
    )
  })

  it('formats counts with thousands separators', () => {
    expect(
      embeddingLine(status({ state: 'running', total: 16000, done: 1234, pending: 14766 }), true)
    ).toBe('Smart search: adding to 1,234 of 16,000 notes.')
  })
})

describe('clearAndRebuildConfirm', () => {
  it('is the plain question with smart search off', () => {
    expect(clearAndRebuildConfirm(false)).toBe(
      "Clear Ryte's local search index and rebuild it from the notes folder?"
    )
  })

  it('adds that the notes are sent again, only with smart search on', () => {
    expect(clearAndRebuildConfirm(true)).toBe(
      "Clear Ryte's local search index and rebuild it from the notes folder? Your notes will be sent to OpenAI again to rebuild smart search."
    )
    expect(clearAndRebuildConfirm(false)).not.toMatch(/OpenAI/)
  })
})
