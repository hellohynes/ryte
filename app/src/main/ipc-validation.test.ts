import { describe, expect, it } from 'vitest'

import {
  assertValidAbsolutePath,
  assertValidFileRenameInput,
  assertValidRequestId,
  assertValidSearchSnapshotFreshnessInput,
  assertValidSearchOptions,
  assertValidSearchQuery,
  assertValidSourceFileInput,
  assertValidSettingsPatch,
  assertValidTaskListInput,
  assertValidTaskToggleInput,
  assertValidWorkspaceCloseTabInput,
  assertValidWorkspaceFileRefInput,
  assertValidWorkspaceFocusTabInput,
  assertValidWorkspaceLibraryPatch,
  assertValidWorkspaceOpenFileInput,
  assertValidWorkspaceOpenRecentFileInput,
  assertValidWorkspaceRecordRecentInput,
  assertValidWorkspaceSetOutlineCollapsedInput,
  assertValidWorkspaceSetOutlineWidthInput,
  assertValidWorkspaceShellPatch,
  assertValidWorkspaceTabFileInput,
  assertValidWorkspaceUpdateTabViewModeInput,
  assertValidWorkspaceWindowPatch
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
    expect(assertValidTaskListInput({ checked: false, limit: 25 })).toEqual({
      checked: false,
      limit: 25
    })
    expect(
      assertValidTaskToggleInput({
        sourcePath: 'folder/tasks.md',
        line: 3,
        checkboxColumn: 2,
        checked: true,
        expectedLine: '- [ ] Follow up'
      })
    ).toEqual({
      sourcePath: 'folder/tasks.md',
      line: 3,
      checkboxColumn: 2,
      checked: true,
      expectedLine: '- [ ] Follow up'
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
    expect(() => assertValidTaskListInput({ arbitrary: true })).toThrow(
      'Invalid task list input key'
    )
    expect(() => assertValidTaskListInput({ checked: 'false' })).toThrow('Invalid task checked')
    expect(() => assertValidTaskListInput({ limit: 201 })).toThrow('Invalid task list limit')
    expect(() => assertValidTaskToggleInput({ arbitrary: true })).toThrow(
      'Invalid task toggle input key'
    )
    expect(() =>
      assertValidTaskToggleInput({
        sourcePath: '../tasks.md',
        line: 3,
        checkboxColumn: 2,
        checked: true,
        expectedLine: '- [ ] Follow up'
      })
    ).toThrow('Invalid workspace source path')
    expect(() =>
      assertValidTaskToggleInput({
        sourcePath: 'tasks.md',
        line: 0,
        checkboxColumn: 2,
        checked: true,
        expectedLine: '- [ ] Follow up'
      })
    ).toThrow('Invalid task line')
    expect(() =>
      assertValidTaskToggleInput({
        sourcePath: 'tasks.md',
        line: 3,
        checkboxColumn: -1,
        checked: true,
        expectedLine: '- [ ] Follow up'
      })
    ).toThrow('Invalid task checkbox column')
  })

  it('accepts a narrow settings patch', () => {
    expect(
      assertValidSettingsPatch({
        notesRoot: '/tmp/notes',
        cloudAnswersEnabled: true,
        cloudAnswersAcknowledgement: {
          acknowledgedAt: '2026-05-19T12:00:00.000Z',
          provider: 'openai',
          model: 'gpt-5.2'
        },
        answerProvider: 'openai',
        answerModel: 'gpt-5.2',
        searchHistoryRetention: '30-days',
        searchHistoryIncludesAnswers: false,
        scrollbarVisibility: 'always'
      })
    ).toMatchObject({
      notesRoot: '/tmp/notes',
      cloudAnswersEnabled: true,
      answerProvider: 'openai',
      answerModel: 'gpt-5.2',
      scrollbarVisibility: 'always'
    })
  })

  it('accepts a known font and color mode, and rejects anything else', () => {
    expect(assertValidSettingsPatch({ fontFamily: 'ibm-plex', colorMode: 'light' })).toMatchObject({
      fontFamily: 'ibm-plex',
      colorMode: 'light'
    })
    expect(() => assertValidSettingsPatch({ fontFamily: 'papyrus' })).toThrow('Invalid font')
    expect(() => assertValidSettingsPatch({ colorMode: 'sepia' })).toThrow('Invalid color mode')
  })

  it('accepts https reference link bases, and an empty one that turns linking off', () => {
    expect(
      assertValidSettingsPatch({
        ticketLinkBase: 'https://example.atlassian.net/browse/',
        pullRequestLinkBase: ''
      })
    ).toMatchObject({
      ticketLinkBase: 'https://example.atlassian.net/browse/',
      pullRequestLinkBase: ''
    })
    expect(() => assertValidSettingsPatch({ ticketLinkBase: 'http://example.com/' })).toThrow(
      'Invalid ticket link base'
    )
    expect(() => assertValidSettingsPatch({ pullRequestLinkBase: 'javascript:alert(1)' })).toThrow(
      'Invalid pull request link base'
    )
  })

  it('rejects unexpected settings keys and invalid ids', () => {
    expect(() => assertValidSettingsPatch({ arbitrary: true })).toThrow('Invalid settings key')
    expect(assertValidSettingsPatch({ answerModel: 'gpt-6-luna' })).toMatchObject({
      answerModel: 'gpt-6-luna'
    })
    expect(() => assertValidSettingsPatch({ scrollbarVisibility: 'visible' })).toThrow(
      'Invalid scrollbar visibility'
    )
  })

  it('accepts narrow workspace shell and window patches', () => {
    expect(
      assertValidWorkspaceShellPatch({
        sidebarCollapsed: true,
        sidebarWidth: 360,
        activeSidebar: 'files'
      })
    ).toEqual({
      sidebarCollapsed: true,
      sidebarWidth: 360,
      activeSidebar: 'files'
    })
    expect(
      assertValidWorkspaceWindowPatch({
        bounds: { x: 10, y: 20, width: 1460, height: 980 },
        maximized: false,
        fullscreen: false
      })
    ).toEqual({
      bounds: { x: 10, y: 20, width: 1460, height: 980 },
      maximized: false,
      fullscreen: false
    })
  })

  it('accepts narrow workspace library patches', () => {
    expect(
      assertValidWorkspaceLibraryPatch({
        expandedFolders: ['./docs', 'sessions/2026-07-02/plans'],
        scrollTop: 420,
        folderSortModes: {
          docs: 'za',
          sessions: 'recency'
        }
      })
    ).toEqual({
      expandedFolders: ['docs', 'sessions/2026-07-02/plans'],
      scrollTop: 420,
      folderSortModes: {
        docs: 'za',
        sessions: 'recency'
      }
    })
  })

  it('rejects unexpected workspace keys and invalid dimensions', () => {
    expect(() => assertValidWorkspaceShellPatch({ arbitrary: true })).toThrow(
      'Invalid workspace shell key'
    )
    expect(() => assertValidWorkspaceShellPatch({ sidebarWidth: -1 })).toThrow(
      'Invalid sidebarWidth'
    )
    expect(() => assertValidWorkspaceShellPatch({ activeSidebar: 'settings' })).toThrow(
      'Invalid activeSidebar'
    )
    expect(() => assertValidWorkspaceShellPatch({ activeSidebar: 'home' })).toThrow(
      'Invalid activeSidebar'
    )
    expect(() => assertValidWorkspaceWindowPatch({ arbitrary: true })).toThrow(
      'Invalid workspace window key'
    )
    expect(() =>
      assertValidWorkspaceWindowPatch({ bounds: { x: 0, y: 0, width: 0, height: 100 } })
    ).toThrow('Invalid window bounds')
    expect(() => assertValidWorkspaceLibraryPatch({ arbitrary: true })).toThrow(
      'Invalid workspace library key'
    )
    expect(() => assertValidWorkspaceLibraryPatch({ expandedFolders: ['../escape'] })).toThrow(
      'Invalid workspace source path'
    )
    expect(() => assertValidWorkspaceLibraryPatch({ scrollTop: -1 })).toThrow('Invalid scrollTop')
    expect(() =>
      assertValidWorkspaceLibraryPatch({ folderSortModes: { 'sessions/2026-07-02': 'za' } })
    ).toThrow('Invalid workspace top-level folder path')
    expect(() =>
      assertValidWorkspaceLibraryPatch({ folderSortModes: { sessions: 'newest' } })
    ).toThrow('Invalid workspace folder sort mode')
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
    expect(assertValidWorkspaceFocusTabInput({ tabId: 'tab-1' })).toEqual({ tabId: 'tab-1' })
    expect(assertValidWorkspaceCloseTabInput({ tabId: 'tab-1' })).toEqual({ tabId: 'tab-1' })
    expect(
      assertValidWorkspaceUpdateTabViewModeInput({ tabId: 'tab-1', viewMode: 'source' })
    ).toEqual({
      tabId: 'tab-1',
      viewMode: 'source'
    })
    expect(assertValidWorkspaceRecordRecentInput({ sourcePath: './folder/a.md' })).toEqual({
      sourcePath: 'folder/a.md'
    })
    expect(assertValidSourceFileInput({ sourcePath: './folder/a.md' })).toEqual({
      sourcePath: 'folder/a.md'
    })
    expect(
      assertValidWorkspaceSetOutlineCollapsedInput({
        sourcePath: 'folder/a.md',
        collapsed: false
      })
    ).toEqual({
      sourcePath: 'folder/a.md',
      collapsed: false
    })
    expect(assertValidWorkspaceSetOutlineWidthInput({ width: 240 })).toEqual({ width: 240 })
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

  it('rejects invalid workspace operation tab ids and view modes', () => {
    expect(() => assertValidWorkspaceFocusTabInput({ tabId: '' })).toThrow(
      'Invalid workspace tab id'
    )
    expect(() => assertValidWorkspaceCloseTabInput({ tabId: '../tab' })).toThrow(
      'Invalid workspace tab id'
    )
    expect(() => assertValidWorkspaceTabFileInput({ tabId: '../tab' })).toThrow(
      'Invalid workspace tab id'
    )
    expect(() =>
      assertValidWorkspaceUpdateTabViewModeInput({ tabId: 'tab-1', viewMode: 'diff' })
    ).toThrow('Invalid workspace tab view mode')
    expect(() =>
      assertValidWorkspaceSetOutlineCollapsedInput({ sourcePath: 'a.md', collapsed: 'yes' })
    ).toThrow('Invalid workspace outline state')
    expect(() => assertValidWorkspaceSetOutlineWidthInput({ width: -1 })).toThrow(
      'Invalid workspace outline width'
    )
    expect(() =>
      assertValidWorkspaceSetOutlineWidthInput({ width: Number.POSITIVE_INFINITY })
    ).toThrow('Invalid workspace outline width')
    expect(() => assertValidWorkspaceSetOutlineWidthInput({ width: 240, extra: true })).toThrow(
      'Invalid workspace outline width input key: extra'
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
