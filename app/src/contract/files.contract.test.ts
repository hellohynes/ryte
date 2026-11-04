import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { createContractApi, mergeContractApi } from '../preload/contract-api'
import { ContractInputError, parseOperationInput } from './define'
import {
  copyContent,
  copyPath,
  files,
  listCatalog,
  listTree,
  moveToTrash,
  readSourceTitle,
  readWorkspaceTab,
  rename,
  showInFinder
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
  moveToTrash
}

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
      'files:move-to-trash'
    ])
    expect(files.events).toEqual({})
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

  it('leaves exactly the watch operations and the change events on the legacy list', () => {
    expect(legacyChannels.request.filter((channel) => channel.startsWith('files:')).sort()).toEqual(
      ['files:unwatch', 'files:watch', 'files:watch-source', 'files:watch-workspace-tab'].sort()
    )
    expect(
      legacyChannels.event.filter(
        (channel) => channel.startsWith('files:') || channel.startsWith('viewer:')
      )
    ).toEqual([
      'files:catalog-changed',
      'files:tree-changed',
      'viewer:file-changed',
      'viewer:source-changed',
      'viewer:workspace-tab-changed'
    ])
    for (const operation of Object.values(operations)) {
      expect(legacyChannels.request, operation.channel).not.toContain(operation.channel)
    }
  })

  it('builds the moved members of window.ryte.files from the contract, beside the hand-written ones', () => {
    const invoked: unknown[][] = []
    const built = createContractApi<Record<string, Record<string, unknown>>>(
      {
        invoke: async (...args) => void invoked.push(args),
        on: () => undefined,
        removeListener: () => undefined
      },
      manifest
    )
    const legacyWatch = (): void => undefined
    const merged = mergeContractApi(
      { files: { watch: legacyWatch, unwatch: legacyWatch } },
      built
    ) as {
      files: Record<string, unknown>
    }

    expect(Object.keys(merged.files).sort()).toEqual(
      [
        'copyContent',
        'copyPath',
        'listCatalog',
        'listTree',
        'moveToTrash',
        'readSourceTitle',
        'readWorkspaceTab',
        'rename',
        'showInFinder',
        'unwatch',
        'watch'
      ].sort()
    )
    expect(merged.files.watch).toBe(legacyWatch)
    ;(merged.files.listTree as () => unknown)()
    ;(merged.files.readWorkspaceTab as (...args: unknown[]) => unknown)({ tabId: 'a' }, 'ignored')
    ;(merged.files.rename as (...args: unknown[]) => unknown)(
      { sourcePath: 'a.md', name: 'b.md' },
      'ignored'
    )
    expect(invoked).toEqual([
      ['files:list-tree'],
      ['files:read-workspace-tab', { tabId: 'a' }],
      ['files:rename', { sourcePath: 'a.md', name: 'b.md' }]
    ])
  })
})

describe('files input', () => {
  it.each([
    ['listTree', listTree],
    ['listCatalog', listCatalog]
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
      ['files.readWorkspaceTab', readWorkspaceTab.input, { tabId: `${secret}/..` }]
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
