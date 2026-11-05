import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { createContractApi } from '../preload/contract-api'
import { ContractInputError, parseOperationInput } from './define'
import {
  catalogChanged,
  copyContent,
  copyPath,
  files,
  listCatalog,
  listTree,
  moveToTrash,
  readSourceTitle,
  readWorkspaceTab,
  rename,
  showInFinder,
  sourceChange,
  treeChanged,
  unwatch,
  watchWorkspaceTab,
  workspaceTabChange
} from './files'
import { manifest } from './manifest.generated'

const operations = {
  listTree,
  listCatalog,
  readSourceTitle,
  readWorkspaceTab,
  copyContent,
  copyPath,
  showInFinder,
  rename,
  moveToTrash,
  watchWorkspaceTab,
  unwatch
}

const events = { treeChanged, catalogChanged, sourceChange, workspaceTabChange }

const legacyChannels = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../../scripts/legacy.json', import.meta.url)), 'utf8')
  ) as { channels: { request: string[]; event: string[] } }
).channels

describe('files operations', () => {
  it('keeps the wire channel names and the renderer-facing operation names', () => {
    expect(Object.keys(files.operations)).toEqual(Object.keys(operations))
    expect(Object.values(operations).map((operation) => operation.channel)).toEqual([
      'files:list-tree',
      'files:list-catalog',
      'files:read-source-title',
      'files:read-workspace-tab',
      'files:copy-content',
      'files:copy-path',
      'files:show-in-finder',
      'files:rename',
      'files:move-to-trash',
      'files:watch-workspace-tab',
      'files:unwatch'
    ])
  })

  it('keeps the wire channel names and the renderer-facing subscriber names of the events', () => {
    expect(Object.keys(files.events)).toEqual(Object.keys(events))
    expect(Object.values(events).map((event) => event.channel)).toEqual([
      'files:tree-changed',
      'files:catalog-changed',
      'viewer:source-changed',
      'viewer:workspace-tab-changed'
    ])
    expect(manifest.files.events).toEqual({
      treeChanged: 'files:tree-changed',
      catalogChanged: 'files:catalog-changed',
      sourceChange: 'viewer:source-changed',
      workspaceTabChange: 'viewer:workspace-tab-changed'
    })

    const subscribed: string[] = []
    const api = createContractApi<Record<string, Record<string, unknown>>>(
      {
        invoke: async () => undefined,
        on: (channel) => void subscribed.push(channel),
        removeListener: () => undefined
      },
      manifest
    )
    // The renderer calls window.ryte.files.onSourceChange, not a `viewer` area: these names are the old ones.
    for (const name of [
      'onTreeChanged',
      'onCatalogChanged',
      'onSourceChange',
      'onWorkspaceTabChange'
    ]) {
      expect(typeof api.files[name], name).toBe('function')
      ;(api.files[name] as (cb: () => void) => void)(() => undefined)
    }
    expect(subscribed).toEqual([
      'files:tree-changed',
      'files:catalog-changed',
      'viewer:source-changed',
      'viewer:workspace-tab-changed'
    ])
    expect(Object.keys(api)).not.toContain('viewer')
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

  it('has no channel for read and read-source, which nothing called', () => {
    const channels = [
      ...Object.values(operations).map((operation) => operation.channel),
      ...Object.values(manifest.files.operations),
      ...legacyChannels.request
    ]
    expect(channels).not.toContain('files:read')
    expect(channels).not.toContain('files:read-source')
    expect(Object.keys(manifest.files.operations)).not.toContain('read')
    expect(Object.keys(manifest.files.operations)).not.toContain('readSource')
  })

  it('has no channel for the three that nothing called, in the contract, the manifest or the legacy list', () => {
    const deleted = ['files:watch', 'files:watch-source', 'viewer:file-changed']
    const channels = [
      ...Object.values(operations).map((operation) => operation.channel),
      ...Object.values(events).map((event) => event.channel),
      ...Object.values(manifest.files.operations),
      ...Object.values(manifest.files.events),
      ...legacyChannels.request,
      ...legacyChannels.event
    ]
    for (const channel of deleted) expect(channels, channel).not.toContain(channel)
    for (const name of ['watch', 'watchSource', 'onChange']) {
      expect(Object.keys(manifest.files.operations)).not.toContain(name)
      expect(Object.keys(manifest.files.events)).not.toContain(name)
    }
  })

  it('leaves only the search channels on the legacy list', () => {
    for (const list of [legacyChannels.request, legacyChannels.event]) {
      expect(list.filter((channel) => !channel.startsWith('search:'))).toEqual([])
    }
    for (const channel of [
      ...Object.values(operations).map((operation) => operation.channel),
      ...Object.values(events).map((event) => event.channel)
    ]) {
      expect(legacyChannels.request, channel).not.toContain(channel)
      expect(legacyChannels.event, channel).not.toContain(channel)
    }
  })

  it('builds all of window.ryte.files from the contract', () => {
    const invoked: unknown[][] = []
    const built = createContractApi<Record<string, Record<string, unknown>>>(
      {
        invoke: async (...args) => void invoked.push(args),
        on: () => undefined,
        removeListener: () => undefined
      },
      manifest
    )

    expect(Object.keys(built.files).sort()).toEqual(
      [
        'copyContent',
        'copyPath',
        'listCatalog',
        'listTree',
        'moveToTrash',
        'onCatalogChanged',
        'onSourceChange',
        'onTreeChanged',
        'onWorkspaceTabChange',
        'readSourceTitle',
        'readWorkspaceTab',
        'rename',
        'showInFinder',
        'unwatch',
        'watchWorkspaceTab'
      ].sort()
    )
    ;(built.files.listTree as () => unknown)()
    ;(built.files.readWorkspaceTab as (...args: unknown[]) => unknown)({ tabId: 'a' }, 'ignored')
    ;(built.files.watchWorkspaceTab as (...args: unknown[]) => unknown)({ tabId: 'a' }, 'ignored')
    ;(built.files.unwatch as () => unknown)()
    ;(built.files.rename as (...args: unknown[]) => unknown)(
      { sourcePath: 'a.md', name: 'b.md' },
      'ignored'
    )
    expect(invoked).toEqual([
      ['files:list-tree'],
      ['files:read-workspace-tab', { tabId: 'a' }],
      ['files:watch-workspace-tab', { tabId: 'a' }],
      ['files:unwatch'],
      ['files:rename', { sourcePath: 'a.md', name: 'b.md' }]
    ])
  })
})

describe('files input', () => {
  it.each([
    ['listTree', listTree],
    ['listCatalog', listCatalog],
    ['unwatch', unwatch]
  ])('takes no input for %s, and rejects a stray argument', (_name, operation) => {
    expect(operation.input.safeParse(undefined).success).toBe(true)
    // Accepted deviation: the legacy handler ignored any argument; the contract rejects one.
    for (const stray of [{}, null, 'x', 0, false]) {
      expect(operation.input.safeParse(stray).success, String(stray)).toBe(false)
    }
  })

  it('takes a file reference, a source path, a tab id or a rename, each as before', () => {
    for (const operation of [copyContent, copyPath, showInFinder, moveToTrash]) {
      expect(operation.input.safeParse({ sourcePath: 'docs/a.md' }).success).toBe(true)
      expect(operation.input.safeParse({ externalPath: '/tmp/a.md' }).success).toBe(true)
      expect(
        operation.input.safeParse({ sourcePath: 'docs/a.md', externalPath: '/tmp/a.md' }).success
      ).toBe(false)
    }
    expect(readSourceTitle.input.safeParse({ sourcePath: 'docs/a.md' }).success).toBe(true)
    expect(readSourceTitle.input.safeParse({ externalPath: '/tmp/a.md' }).success).toBe(false)
    expect(readWorkspaceTab.input.safeParse({ tabId: 'tab-1' }).success).toBe(true)
    expect(readWorkspaceTab.input.safeParse({ tabId: '../tab' }).success).toBe(false)
    expect(watchWorkspaceTab.input.safeParse({ tabId: 'tab-1' }).success).toBe(true)
    expect(watchWorkspaceTab.input.safeParse({ tabId: '../tab' }).success).toBe(false)
    expect(watchWorkspaceTab.input.safeParse({ tabId: 'tab-1', extra: 1 }).success).toBe(false)
    expect(watchWorkspaceTab.input.safeParse(undefined).success).toBe(false)
  })

  it('judges the tab id of a watch as it judges the tab id of a read', () => {
    for (const tabId of [
      'a',
      '1',
      'a:b_c.d-e',
      'a'.repeat(200),
      'a'.repeat(201),
      '.a',
      'a\n',
      'a\0',
      ''
    ]) {
      expect(watchWorkspaceTab.input.safeParse({ tabId }).success, JSON.stringify(tabId)).toBe(
        readWorkspaceTab.input.safeParse({ tabId }).success
      )
    }
  })

  it('hands the store only the key that was set, as the old validators did', () => {
    expect(
      parseOperationInput('files.copyPath', copyPath.input, {
        sourcePath: './docs/a.md',
        externalPath: undefined
      })
    ).toStrictEqual({ sourcePath: 'docs/a.md' })
    expect(
      parseOperationInput('files.rename', rename.input, {
        externalPath: '/tmp/a.md',
        sourcePath: undefined,
        name: 'b.md'
      })
    ).toStrictEqual({ externalPath: '/tmp/a.md', name: 'b.md' })
  })

  it('names the operation and the fields, never a value, when an input is rejected', () => {
    const secret = 'secret-folder'
    for (const [operation, schema, input] of [
      ['files.copyContent', copyContent.input, { sourcePath: `../${secret}/a.md` }],
      ['files.showInFinder', showInFinder.input, { [secret]: 1 }],
      ['files.rename', rename.input, { sourcePath: 'a.md', name: `${secret}/b.md` }],
      ['files.rename', rename.input, { externalPath: `/tmp/${secret}.txt`, name: 'b.md' }],
      ['files.readSourceTitle', readSourceTitle.input, { sourcePath: `../${secret}` }],
      ['files.readWorkspaceTab', readWorkspaceTab.input, { tabId: `${secret}/..` }],
      ['files.watchWorkspaceTab', watchWorkspaceTab.input, { tabId: `${secret}/..` }]
    ] as const) {
      let thrown: unknown
      try {
        parseOperationInput(operation, schema, input)
      } catch (error) {
        thrown = error
      }
      expect(thrown, operation).toBeInstanceOf(ContractInputError)
      expect((thrown as Error).message.startsWith(`Invalid ${operation} input`), operation).toBe(
        true
      )
      expect((thrown as Error).message, operation).not.toMatch(/secret/)
    }
  })
})

describe('files output', () => {
  const entry = {
    sourcePath: 'docs/a.md',
    title: 'a',
    directory: 'docs',
    searchableText: 'a docs docs/a.md',
    pathDate: '2026-01-01',
    modifiedAt: '2026-01-02T00:00:00.000Z',
    modifiedAtMs: 1767312000000,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdAtMs: 1767225600000,
    sizeBytes: 5
  }

  it('describes a catalog entry whose creation time is unknown, and an empty tree', () => {
    expect(
      listCatalog.output.safeParse({
        notesRoot: '/n',
        files: [entry, { ...entry, pathDate: null, createdAt: null, createdAtMs: null }]
      }).success
    ).toBe(true)
    expect(listCatalog.output.safeParse({ notesRoot: '/n', files: [] }).success).toBe(true)
    expect(listTree.output.safeParse({ notesRoot: '/n', paths: [] }).success).toBe(true)
  })

  it('requires the fields the renderer reads', () => {
    for (const key of Object.keys(entry)) {
      const rest = Object.fromEntries(Object.entries(entry).filter(([name]) => name !== key))
      expect(listCatalog.output.safeParse({ notesRoot: '/n', files: [rest] }).success, key).toBe(
        false
      )
    }
    expect(listTree.output.safeParse({ paths: [] }).success).toBe(false)
  })

  it('allows a note with no title and nothing else for the title', () => {
    expect(readSourceTitle.output.safeParse(null).success).toBe(true)
    expect(readSourceTitle.output.safeParse('Plan').success).toBe(true)
    expect(readSourceTitle.output.safeParse(undefined).success).toBe(false)
  })

  it('returns nothing from the clipboard and Finder operations', () => {
    for (const operation of [copyContent, copyPath, showInFinder]) {
      expect(operation.output.safeParse(undefined).success, operation.channel).toBe(true)
    }
  })

  it('describes the rename and trash results with the workspace the store returns', () => {
    expect(rename.output.safeParse(rename.example.output).success).toBe(true)
    expect(
      rename.output.safeParse({
        file: { externalPath: '/tmp/b.md' },
        workspace: rename.example.output.workspace
      }).success
    ).toBe(true)
    expect(rename.output.safeParse({ workspace: rename.example.output.workspace }).success).toBe(
      false
    )
    expect(
      moveToTrash.output.safeParse({ trashed: false, workspace: rename.example.output.workspace })
        .success
    ).toBe(true)
    expect(
      moveToTrash.output.safeParse({ workspace: rename.example.output.workspace }).success
    ).toBe(false)
  })
})

describe('files events', () => {
  const entry = {
    sourcePath: 'docs/a.md',
    title: 'a',
    directory: 'docs',
    searchableText: 'a docs docs/a.md',
    pathDate: null,
    modifiedAt: '2026-01-02T00:00:00.000Z',
    modifiedAtMs: 1767312000000,
    createdAt: null,
    createdAtMs: null,
    sizeBytes: 5
  }
  const catalogPayload = catalogChanged.payload!
  const accepts = (value: unknown): boolean => catalogPayload.safeParse(value).success

  it('has no payload for a tree change and a string for each viewer change', () => {
    expect(treeChanged.payload).toBeUndefined()
    expect(sourceChange.payload!.safeParse('docs/a.md').success).toBe(true)
    expect(sourceChange.payload!.safeParse(1).success).toBe(false)
    expect(workspaceTabChange.payload!.safeParse('tab-1').success).toBe(true)
    expect(workspaceTabChange.payload!.safeParse(1).success).toBe(false)
  })

  it('takes an upsert, a remove, or no change at all, which means refresh everything', () => {
    expect(accepts({ type: 'upsert', file: entry })).toBe(true)
    expect(accepts({ type: 'remove', sourcePath: 'docs/a.md' })).toBe(true)
    expect(accepts(undefined)).toBe(true)
  })

  it.each([
    ['null', null],
    ['an empty object', {}],
    ['an unknown type', { type: 'rename', sourcePath: 'a.md' }],
    ['an upsert without its file', { type: 'upsert' }],
    ['an upsert with a file missing a field', { type: 'upsert', file: { sourcePath: 'a.md' } }],
    ['a remove without its path', { type: 'remove' }],
    ['a remove with a numeric path', { type: 'remove', sourcePath: 1 }],
    ['a bare string', 'docs/a.md']
  ])('rejects %s', (_label, value) => {
    expect(accepts(value)).toBe(false)
  })
})
