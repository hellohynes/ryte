import { describe, expect, it } from 'vitest'

import {
  assertValidRequestId,
  assertValidSearchSnapshotFreshnessInput,
  assertValidSearchOptions,
  assertValidSearchQuery
} from './ipc-validation'

describe('ipc validation', () => {
  it('accepts expected request ids and queries', () => {
    expect(assertValidRequestId('1f9c5da2-4020-4af6-92ac-111111111111')).toBe(
      '1f9c5da2-4020-4af6-92ac-111111111111'
    )
    expect(assertValidSearchQuery('  project plan  ')).toBe('project plan')
    expect(
      assertValidSearchOptions({ retrievalMode: 'keyword', answerMode: 'local-only' })
    ).toEqual({
      retrievalMode: 'keyword',
      answerMode: 'local-only'
    })
  })

  it('rejects malformed primitive inputs', () => {
    expect(() => assertValidRequestId('req-1')).toThrow('Invalid request id')
    expect(() => assertValidSearchQuery('')).toThrow('Invalid search query')
    expect(() => assertValidSearchOptions({ retrievalMode: 'remote' })).toThrow(
      'Invalid retrieval mode'
    )
    expect(() => assertValidSearchOptions({ arbitrary: true })).toThrow('Invalid search option')
  })
})

it('accepts bounded snapshot-freshness input and rejects invalid timestamps', () => {
  expect(
    assertValidSearchSnapshotFreshnessInput({
      query: 'jira plans',
      retrievalMode: 'keyword',
      generatedAt: 100,
      sourcePaths: ['plans/jira.md']
    })
  ).toEqual({
    query: 'jira plans',
    retrievalMode: 'keyword',
    generatedAt: 100,
    sourcePaths: ['plans/jira.md']
  })
  expect(() =>
    assertValidSearchSnapshotFreshnessInput({
      query: 'jira plans',
      retrievalMode: 'keyword',
      generatedAt: -1,
      sourcePaths: []
    })
  ).toThrow('Invalid snapshot generated time')
})
