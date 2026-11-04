import { describe, expect, it } from 'vitest'

import { workspaceTabId } from '../contract/primitives'
import {
  assertValidAbsolutePath,
  assertValidRequestId,
  assertValidSearchSnapshotFreshnessInput,
  assertValidSearchOptions,
  assertValidSearchQuery,
  assertValidSourceFileInput,
  assertValidWorkspaceTabFileInput
} from './ipc-validation'

describe('ipc validation', () => {
  it('accepts expected request ids, paths, and queries', () => {
    expect(assertValidRequestId('1f9c5da2-4020-4af6-92ac-111111111111')).toBe(
      '1f9c5da2-4020-4af6-92ac-111111111111'
    )
    expect(assertValidAbsolutePath('/tmp/notes/a.md')).toBe('/tmp/notes/a.md')
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
    expect(() => assertValidAbsolutePath('../notes/a.md')).toThrow('Invalid file path')
    expect(() => assertValidSearchQuery('')).toThrow('Invalid search query')
    expect(() => assertValidSearchOptions({ retrievalMode: 'remote' })).toThrow(
      'Invalid retrieval mode'
    )
    expect(() => assertValidSearchOptions({ arbitrary: true })).toThrow('Invalid search option')
  })

  it('accepts narrow workspace operation payloads', () => {
    expect(assertValidWorkspaceTabFileInput({ tabId: 'tab-1' })).toEqual({ tabId: 'tab-1' })
    expect(assertValidSourceFileInput({ sourcePath: './folder/a.md' })).toEqual({
      sourcePath: 'folder/a.md'
    })
  })

  it('rejects invalid workspace operation source paths and unknown keys', () => {
    expect(() => assertValidSourceFileInput({ sourcePath: '/tmp/a.md' })).toThrow(
      'Invalid workspace source path'
    )
    expect(() => assertValidSourceFileInput({ sourcePath: '../a.md' })).toThrow(
      'Invalid workspace source path'
    )
    expect(() => assertValidSourceFileInput({ sourcePath: 'a.md', arbitrary: true })).toThrow(
      'Invalid source file input key'
    )
  })

  it('rejects invalid workspace operation tab ids', () => {
    expect(() => assertValidWorkspaceTabFileInput({ tabId: '../tab' })).toThrow(
      'Invalid workspace tab id'
    )
  })

  it('judges a tab id as the contract does, since both read one pattern', () => {
    for (const tabId of [
      'a',
      '1',
      'a:b_c.d-e',
      'a'.repeat(200),
      'a'.repeat(201),
      '.a',
      'a\n',
      'a\0'
    ]) {
      let legacy = true
      try {
        assertValidWorkspaceTabFileInput({ tabId })
      } catch {
        legacy = false
      }
      expect(legacy, JSON.stringify(tabId)).toBe(workspaceTabId.safeParse(tabId).success)
    }
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
