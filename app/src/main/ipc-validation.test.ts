import { describe, expect, it } from 'vitest'

import {
  assertValidAbsolutePath,
  assertValidFileRenameInput,
  assertValidRequestId,
  assertValidSearchSnapshotFreshnessInput,
  assertValidSearchOptions,
  assertValidSearchQuery,
  assertValidSourceFileInput,
  assertValidWorkspaceFileRefInput,
  assertValidWorkspaceOpenFileInput,
  assertValidWorkspaceOpenRecentFileInput,
  assertValidWorkspaceRecordRecentInput,
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
    expect(assertValidFileRenameInput({ sourcePath: 'folder/a.md', name: 'renamed.md' })).toEqual({
      sourcePath: 'folder/a.md',
      name: 'renamed.md'
    })
    expect(
      assertValidFileRenameInput({ externalPath: '/tmp/outside.md', name: 'renamed.md' })
    ).toEqual({ externalPath: '/tmp/outside.md', name: 'renamed.md' })
    expect(assertValidWorkspaceOpenFileInput({ sourcePath: 'folder/a.md' })).toEqual({
      sourcePath: 'folder/a.md'
    })
    expect(assertValidWorkspaceFileRefInput({ sourcePath: 'folder/a.md' })).toEqual({
      sourcePath: 'folder/a.md'
    })
    expect(assertValidWorkspaceFileRefInput({ externalPath: '/tmp/outside.md' })).toEqual({
      externalPath: '/tmp/outside.md'
    })
    expect(assertValidWorkspaceOpenRecentFileInput({ externalPath: '/tmp/outside.md' })).toEqual({
      externalPath: '/tmp/outside.md'
    })
    expect(assertValidWorkspaceTabFileInput({ tabId: 'tab-1' })).toEqual({ tabId: 'tab-1' })
    expect(assertValidWorkspaceRecordRecentInput({ sourcePath: './folder/a.md' })).toEqual({
      sourcePath: 'folder/a.md'
    })
    expect(assertValidSourceFileInput({ sourcePath: './folder/a.md' })).toEqual({
      sourcePath: 'folder/a.md'
    })
  })

  it('rejects invalid workspace operation source paths and unknown keys', () => {
    expect(() => assertValidFileRenameInput({ sourcePath: 'a.md', name: '../renamed.md' })).toThrow(
      'Invalid file name'
    )
    expect(() => assertValidFileRenameInput({ sourcePath: 'a.md', name: 'renamed.txt' })).toThrow(
      'Invalid file name'
    )
    expect(() =>
      assertValidFileRenameInput({ sourcePath: 'a.md', name: 'renamed.md', extra: true })
    ).toThrow('Invalid file rename input key')
    expect(() => assertValidWorkspaceOpenFileInput({ sourcePath: '/tmp/a.md' })).toThrow(
      'Invalid workspace source path'
    )
    expect(() => assertValidWorkspaceOpenFileInput({ sourcePath: '../a.md' })).toThrow(
      'Invalid workspace source path'
    )
    expect(() =>
      assertValidWorkspaceOpenFileInput({ sourcePath: 'a.md', arbitrary: true })
    ).toThrow('Invalid workspace open file input key')
    expect(() =>
      assertValidWorkspaceFileRefInput({
        sourcePath: 'a.md',
        externalPath: '/tmp/a.md'
      })
    ).toThrow('Invalid workspace file reference')
    expect(() => assertValidWorkspaceFileRefInput({ externalPath: '/tmp/a.txt' })).toThrow(
      'Invalid workspace external path'
    )
    expect(() => assertValidWorkspaceFileRefInput({ externalPath: 'relative.md' })).toThrow(
      'Invalid workspace external path'
    )
    expect(() =>
      assertValidWorkspaceFileRefInput({ externalPath: '/tmp/a.md', arbitrary: true })
    ).toThrow('Invalid workspace file reference key')
    expect(() => assertValidWorkspaceRecordRecentInput({ sourcePath: 'a\0.md' })).toThrow(
      'Invalid workspace source path'
    )
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
