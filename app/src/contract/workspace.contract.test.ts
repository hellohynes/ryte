import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { createContractApi, mergeContractApi } from '../preload/contract-api'
import { ContractInputError, parseOperationInput } from './define'
import { manifest } from './manifest.generated'
import {
  closeTab,
  focusTab,
  getState,
  setOutlineCollapsed,
  setOutlineWidth,
  updateLibrary,
  updateShell,
  updateTabViewMode,
  workspace
} from './workspace'

const operations = {
  getState,
  updateShell,
  updateLibrary,
  focusTab,
  closeTab,
  updateTabViewMode,
  setOutlineCollapsed,
  setOutlineWidth
}

const legacyChannels = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../../scripts/legacy.json', import.meta.url)), 'utf8')
  ) as { channels: { request: string[] } }
).channels.request

describe('workspace operations', () => {
  it('keeps the wire channel names and the renderer-facing operation names', () => {
    expect(Object.keys(workspace.operations)).toEqual(Object.keys(operations))
    expect(Object.values(operations).map((operation) => operation.channel)).toEqual([
      'workspace:get-state',
      'workspace:update-shell',
      'workspace:update-library',
      'workspace:focus-tab',
      'workspace:close-tab',
      'workspace:update-tab-view-mode',
      'workspace:set-outline-collapsed',
      'workspace:set-outline-width'
    ])
  })

  it('validates each operation example against its own schemas', () => {
    for (const operation of Object.values(operations)) {
      expect(operation.input.safeParse(operation.example.input).success, operation.channel).toBe(
        true
      )
      expect(operation.output.safeParse(operation.example.output).success, operation.channel).toBe(
        true
      )
    }
  })

  it('has no channel for the window update, which nothing called', () => {
    const channels = [
      ...Object.values(operations).map((operation) => operation.channel),
      ...Object.values(manifest.workspace.operations),
      ...legacyChannels
    ]
    expect(channels).not.toContain('workspace:update-window')
    expect(Object.keys(manifest.workspace.operations)).not.toContain('updateWindow')
  })

  it('leaves the five operations that refresh the menu on the legacy list, and only those', () => {
    expect(legacyChannels.filter((channel) => channel.startsWith('workspace:')).sort()).toEqual([
      'workspace:open-file',
      'workspace:open-native-file',
      'workspace:open-recent-file',
      'workspace:prune-missing-file-refs',
      'workspace:record-recent'
    ])
  })

  it('builds the contract half of window.ryte.workspace and merges it with the legacy half', () => {
    const invoked: unknown[][] = []
    const built = createContractApi<Record<string, Record<string, unknown>>>(
      {
        invoke: async (...args) => void invoked.push(args),
        on: () => undefined,
        removeListener: () => undefined
      },
      manifest
    )
    const legacy = {
      workspace: {
        openFile: () => 'legacy',
        openRecentFile: () => 'legacy',
        openNativeFile: () => 'legacy',
        recordRecent: () => 'legacy',
        pruneMissingFileRefs: () => 'legacy'
      }
    }

    const merged = mergeContractApi(legacy, built) as { workspace: Record<string, unknown> }

    expect(Object.keys(merged.workspace).sort()).toEqual(
      [
        'closeTab',
        'focusTab',
        'getState',
        'openFile',
        'openNativeFile',
        'openRecentFile',
        'pruneMissingFileRefs',
        'recordRecent',
        'setOutlineCollapsed',
        'setOutlineWidth',
        'updateLibrary',
        'updateShell',
        'updateTabViewMode'
      ].sort()
    )
    ;(merged.workspace.focusTab as (...args: unknown[]) => unknown)({ tabId: 'a' }, 'ignored')
    expect(invoked).toEqual([['workspace:focus-tab', { tabId: 'a' }]])
    expect((merged.workspace.openFile as () => string)()).toBe('legacy')
  })
})

describe('workspace input', () => {
  it('takes no input for get-state, and rejects a stray argument', () => {
    expect(getState.input.safeParse(undefined).success).toBe(true)
    // Accepted deviation: the legacy handler ignored any argument; the contract rejects one.
    for (const stray of [{}, null, 'x', 0, false]) {
      expect(getState.input.safeParse(stray).success, String(stray)).toBe(false)
    }
  })

  it('normalizes paths the way the validators did', () => {
    expect(
      parseOperationInput('workspace.setOutlineCollapsed', setOutlineCollapsed.input, {
        sourcePath: './docs//a.md',
        collapsed: true
      })
    ).toStrictEqual({ sourcePath: 'docs/a.md', collapsed: true })
    expect(
      parseOperationInput('workspace.updateLibrary', updateLibrary.input, {
        expandedFolders: ['./docs'],
        folderSortModes: { './docs': 'za' }
      })
    ).toStrictEqual({ expandedFolders: ['docs'], folderSortModes: { docs: 'za' } })
  })

  it('names the operation and the fields, never a value, when an input is rejected', () => {
    const secret = 'secret-folder'
    for (const [operation, name, schema, input] of [
      ['workspace.focusTab', 'focusTab', focusTab.input, { tabId: `${secret}/..` }],
      [
        'workspace.updateLibrary',
        'updateLibrary',
        updateLibrary.input,
        { folderSortModes: { [`${secret}/x`]: 'za' } }
      ],
      [
        'workspace.updateLibrary',
        'updateLibrary',
        updateLibrary.input,
        { expandedFolders: [`../${secret}`] }
      ],
      ['workspace.updateShell', 'updateShell', updateShell.input, { [secret]: 1 }]
    ] as const) {
      let thrown: unknown
      try {
        parseOperationInput(operation, schema, input)
      } catch (error) {
        thrown = error
      }
      expect(thrown, name).toBeInstanceOf(ContractInputError)
      const message = (thrown as Error).message
      expect(message.startsWith(`Invalid ${operation} input`), name).toBe(true)
      expect(message, name).not.toMatch(/secret/)
    }
  })
})

describe('workspace output', () => {
  const state = {
    schemaVersion: 6,
    shell: { sidebarCollapsed: true, sidebarWidth: 164, activeSidebar: 'files' },
    library: {
      expandedFolders: ['docs', 'docs/plans'],
      scrollTop: 12,
      folderSortModes: { docs: 'recency' }
    },
    window: {
      bounds: { x: -10, y: 0, width: 1460, height: 980 },
      maximized: false,
      fullscreen: true
    },
    tabs: [
      { id: 'a', sourcePath: 'docs/a.md', title: 'a.md', viewMode: 'source' },
      { id: 'b', externalPath: '/tmp/outside.md', title: 'outside.md', viewMode: 'preview' }
    ],
    activeTabId: 'b',
    recents: [
      { sourcePath: 'docs/a.md', title: 'a.md', openedAt: '2026-01-01T00:00:00.000Z' },
      { externalPath: '/tmp/outside.md', title: 'outside.md', openedAt: '2026-01-02T00:00:00.000Z' }
    ],
    outlineWidth: 140,
    outlineCollapsedByPath: { 'docs/a.md': true }
  }

  it('describes every shape the store returns: external files, bounds, null folders and ids', () => {
    expect(getState.output.safeParse(state).success).toBe(true)
    expect(
      getState.output.safeParse({
        ...state,
        library: { ...state.library, expandedFolders: null },
        window: { ...state.window, bounds: null },
        tabs: [],
        activeTabId: null,
        recents: []
      }).success
    ).toBe(true)
  })

  it('keeps both file-reference keys out of one tab', () => {
    expect(
      getState.output.safeParse({
        ...state,
        tabs: [
          { id: 'a', sourcePath: 'a.md', externalPath: '/tmp/a.md', title: 'a', viewMode: 'source' }
        ]
      }).success
    ).toBe(false)
  })

  it('requires the fields the renderer reads', () => {
    for (const key of Object.keys(state)) {
      const rest = Object.fromEntries(Object.entries(state).filter(([name]) => name !== key))
      expect(getState.output.safeParse(rest).success, `without ${key}`).toBe(false)
    }
    expect(getState.output.safeParse({ ...state, schemaVersion: 5 }).success).toBe(false)
  })
})
