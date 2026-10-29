import { describe, expect, it } from 'vitest'

import type { FileCatalogEntry } from '../../../shared/files'
import { buildSidebarTree, modifiedAtMsBySourcePath } from './sidebar-tree-model'

function catalogEntry(sourcePath: string, modifiedAtMs: number): FileCatalogEntry {
  return {
    sourcePath,
    title: sourcePath,
    directory: sourcePath.includes('/') ? sourcePath.split('/').slice(0, -1).join('/') : '',
    searchableText: sourcePath,
    pathDate: null,
    modifiedAt: new Date(modifiedAtMs).toISOString(),
    modifiedAtMs,
    createdAt: null,
    createdAtMs: null,
    sizeBytes: 1
  }
}

function namesForChildren(
  paths: readonly string[],
  folder: string,
  options: Parameters<typeof buildSidebarTree>[1] = {},
  files: FileCatalogEntry[] = []
): string[] {
  const tree = buildSidebarTree(paths, options, modifiedAtMsBySourcePath(files))
  return tree.find((node) => node.relPath === folder)?.children.map((child) => child.name) ?? []
}

describe('buildSidebarTree', () => {
  const paths = [
    'sessions/2026-02-10/a.md',
    'sessions/2026-07-07/a.md',
    'sessions/2026-05-22/a.md',
    'docs/setup.md',
    'docs/overview.md',
    'docs/architecture.md'
  ]

  it('sorts top-level folder children A-Z by default', () => {
    expect(namesForChildren(paths, 'sessions')).toEqual(['2026-02-10', '2026-05-22', '2026-07-07'])
    expect(namesForChildren(paths, 'docs')).toEqual(['architecture.md', 'overview.md', 'setup.md'])
  })

  it('sorts only the selected top-level folder Z-A', () => {
    expect(namesForChildren(paths, 'sessions', { sessions: 'za' })).toEqual([
      '2026-07-07',
      '2026-05-22',
      '2026-02-10'
    ])
    expect(namesForChildren(paths, 'docs', { sessions: 'za' })).toEqual([
      'architecture.md',
      'overview.md',
      'setup.md'
    ])
  })

  it('sorts selected top-level folder children by most recent descendant', () => {
    const files = [
      catalogEntry('sessions/2026-02-10/a.md', 10),
      catalogEntry('sessions/2026-07-07/a.md', 30),
      catalogEntry('sessions/2026-05-22/a.md', 20)
    ]

    expect(namesForChildren(paths, 'sessions', { sessions: 'recency' }, files)).toEqual([
      '2026-07-07',
      '2026-05-22',
      '2026-02-10'
    ])
  })
})
