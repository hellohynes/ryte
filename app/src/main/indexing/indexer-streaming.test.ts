import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Chunk } from './chunker'
import { Indexer } from './indexer'
import type { IndexStateStore } from './index-state'
import type { VectorStore } from './vector-store'

const walkNotesMock = vi.hoisted(() => vi.fn<() => Promise<string[]>>())
const chunkFileMock = vi.hoisted(() => vi.fn<(absPath: string, notesRoot: string) => Chunk[]>())

vi.mock('./walker', () => ({
  walkNotes: walkNotesMock
}))

vi.mock('./chunker', async () => {
  const actual = await vi.importActual<typeof import('./chunker')>('./chunker')
  return {
    ...actual,
    chunkFile: chunkFileMock
  }
})

describe('Indexer memory behavior', () => {
  let tempDir: string
  let notesRoot: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ryte-indexer-streaming-'))
    notesRoot = join(tempDir, 'notes')
    mkdirSync(notesRoot, { recursive: true })
    walkNotesMock.mockReset()
    chunkFileMock.mockReset()
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('writes each changed file before chunking the next file', async () => {
    const events: string[] = []
    const firstPath = join(notesRoot, 'a.md')
    const secondPath = join(notesRoot, 'b.md')
    writeFileSync(firstPath, '# A\n\nbody A\n')
    writeFileSync(secondPath, '# B\n\nbody B\n')

    walkNotesMock.mockResolvedValue([firstPath, secondPath])
    chunkFileMock.mockImplementation((absPath) => {
      const fileName = basename(absPath)
      events.push(`chunk:${fileName}`)
      return [
        {
          text: `body for ${fileName}`,
          sourcePath: fileName,
          headingPath: [],
          date: null,
          frontmatter: {}
        }
      ]
    })

    const indexState = {
      allSourcePaths: () => [],
      shouldReindex: () => true,
      markIndexed: (sourcePath: string) => {
        events.push(`mark:${sourcePath}`)
      },
      markRemoved: vi.fn()
    } as unknown as IndexStateStore
    const vectorStore = {
      replaceFileTextChunks: (sourcePath: string) => {
        events.push(`replace:${sourcePath}`)
      },
      deleteFileChunks: vi.fn()
    } as unknown as VectorStore

    const indexer = new Indexer({
      notesRoot,
      embedder: null,
      vectorStore,
      indexState
    })

    await indexer.indexAll()

    expect(events).toEqual([
      'chunk:a.md',
      'replace:a.md',
      'mark:a.md',
      'chunk:b.md',
      'replace:b.md',
      'mark:b.md'
    ])
  })
})
