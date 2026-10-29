/**
 * Safe native smoke test for the indexing pipeline.
 *
 * Uses synthetic markdown fixtures in a temp directory. It does not read the
 * user's real notes folder and does not print note body content.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Indexer } from '../src/main/indexing/indexer'
import { IndexStateStore } from '../src/main/indexing/index-state'
import { VectorStore } from '../src/main/indexing/vector-store'
import type { EmbeddingProvider } from '../src/main/indexing/embedder'

const DIM = 1536

function vectorFor(text: string): Float32Array {
  const vector = new Float32Array(DIM)
  const lower = text.toLowerCase()
  vector[0] = lower.includes('alpha') ? 1 : 0
  vector[1] = lower.includes('privacy') ? 1 : 0
  vector[2] = lower.includes('release') ? 1 : 0
  vector[3] = 0.1
  return vector
}

const fakeEmbedder: EmbeddingProvider = {
  dim: DIM,
  embed: async (texts: string[]): Promise<Float32Array[]> => texts.map(vectorFor)
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function writeFixtureCorpus(notesRoot: string): { alphaPath: string } {
  const projectsDir = join(notesRoot, 'projects')
  const sessionsDir = join(notesRoot, 'sessions', '2026-05-19')
  mkdirSync(projectsDir, { recursive: true })
  mkdirSync(sessionsDir, { recursive: true })

  const alphaPath = join(projectsDir, 'alpha.md')
  writeFileSync(
    alphaPath,
    [
      '# Alpha',
      '',
      'Alpha roadmap covers local keyword search and privacy boundaries.',
      '',
      '## Release',
      '',
      'Release planning includes signed builds and safe smoke tests.'
    ].join('\n')
  )
  writeFileSync(
    join(sessionsDir, 'privacy.md'),
    [
      '# Privacy',
      '',
      'Cloud answers require explicit user acknowledgement before excerpts leave the device.'
    ].join('\n')
  )
  writeFileSync(join(notesRoot, 'ignored.txt'), 'not markdown')

  return { alphaPath }
}

async function main(): Promise<void> {
  const tempDir = mkdtempSync(join(tmpdir(), 'ryte-fixture-smoke-'))
  const notesRoot = join(tempDir, 'notes')
  const dbPath = join(tempDir, 'index.db')

  try {
    const { alphaPath } = writeFixtureCorpus(notesRoot)

    const store = new VectorStore(dbPath)
    store.init(DIM)
    const state = new IndexStateStore(store.database)
    state.init()

    const indexer = new Indexer({
      notesRoot,
      embedder: fakeEmbedder,
      vectorStore: store,
      indexState: state
    })

    const first = await indexer.indexAll()
    assert(first.filesIndexed === 2, `expected 2 markdown files indexed, got ${first.filesIndexed}`)
    assert(first.chunksIndexed === 3, `expected 3 chunks indexed, got ${first.chunksIndexed}`)
    assert(store.fileCount() === 2, `expected 2 stored files, got ${store.fileCount()}`)
    assert(store.chunkCount() === 3, `expected 3 stored chunks, got ${store.chunkCount()}`)

    const keywordResults = store.hybridSearch('privacy boundaries', vectorFor('privacy'), 5, 5)
    assert(
      keywordResults.some((row) => row.sourcePath === 'projects/alpha.md'),
      'expected keyword/hybrid search to find projects/alpha.md'
    )

    const naturalLanguageResults = store.keywordSearch('give me privacy / release statuses', 5)
    assert(
      naturalLanguageResults.length > 0,
      'expected natural-language keyword search with punctuation to return results'
    )

    const second = await indexer.indexAll()
    assert(
      second.filesIndexed === 0,
      `expected second pass to skip files, got ${second.filesIndexed}`
    )
    assert(
      second.chunksIndexed === 0,
      `expected second pass to skip chunks, got ${second.chunksIndexed}`
    )

    await indexer.removeFile(alphaPath)
    const afterDelete = store.hybridSearch('alpha roadmap', vectorFor('alpha'), 5, 5)
    assert(
      afterDelete.every((row) => row.sourcePath !== 'projects/alpha.md'),
      'expected removed file to disappear from search results'
    )

    store.close()
    console.log('Safe indexer smoke test passed.')
    console.log(`  files indexed: ${first.filesIndexed}`)
    console.log(`  chunks indexed: ${first.chunksIndexed}`)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
