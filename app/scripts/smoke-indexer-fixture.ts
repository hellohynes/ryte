/**
 * Safe native smoke test for the indexing pipeline.
 *
 * Uses synthetic markdown fixtures in a temp directory. It does not read the
 * user's real notes folder and does not print note body content.
 */

import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Indexer } from '../src/main/indexing/indexer'
import { indexLocationFor } from '../src/main/indexing/index-location'
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

/** What the embedding step does after a local pass: vectors for every note that has none yet. */
async function attachFakeVectors(store: VectorStore, state: IndexStateStore): Promise<void> {
  for (const { sourcePath, mtimeMs } of state.unembeddedSources()) {
    const chunks = store.chunkTextsForFile(sourcePath)
    const vectors = await fakeEmbedder.embed(chunks.map((chunk) => chunk.text))
    const result = store.attachVectors(
      sourcePath,
      mtimeMs,
      chunks.map((chunk, index) => ({ ...chunk, vector: vectors[index] }))
    )
    assert(result === 'attached', `expected vectors to attach to ${sourcePath}, got ${result}`)
  }
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

async function indexFolderInto(notesRoot: string, dbPath: string): Promise<VectorStore> {
  mkdirSync(join(dbPath, '..'), { recursive: true })
  const store = new VectorStore(dbPath)
  store.init(DIM)
  const state = new IndexStateStore(store.database)
  state.init()
  await new Indexer({ notesRoot, vectorStore: store, indexState: state }).indexAll()
  return store
}

function storedText(store: VectorStore, sourcePath: string): string {
  const rows = store.database
    .prepare('SELECT text FROM chunks WHERE source_path = ?')
    .all(sourcePath) as Array<{ text: string }>
  return rows.map((row) => row.text).join('\n')
}

/**
 * A note at the same relative path in two folders. The folder indexed second has the older copy, so a shared index keeps the first
 * folder's text; one index file per folder does not.
 */
async function sameRelativePathScenario(): Promise<void> {
  const tempDir = mkdtempSync(join(tmpdir(), 'ryte-fixture-two-folders-'))
  try {
    const first = join(tempDir, 'first')
    const second = join(tempDir, 'second')
    mkdirSync(first)
    mkdirSync(second)
    writeFileSync(join(first, 'shared.md'), '# Shared\n\nFIRST folder text about gardens.')
    writeFileSync(join(second, 'shared.md'), '# Shared\n\nSECOND folder text about harbours.')
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    utimesSync(join(second, 'shared.md'), twoDaysAgo, twoDaysAgo)

    // The old layout: one file for every folder. This must still show the stale text, or the check below proves nothing.
    const sharedPath = join(tempDir, 'shared-index', 'index.db')
    await indexFolderInto(first, sharedPath).then((store) => store.close())
    const shared = await indexFolderInto(second, sharedPath)
    const staleText = storedText(shared, 'shared.md')
    shared.close()
    assert(
      staleText.includes('FIRST') && !staleText.includes('SECOND'),
      'the fixture no longer reproduces stale content in a shared index, so the per-folder check proves nothing'
    )

    // One file per folder: each folder's file holds only that folder's text.
    const userData = join(tempDir, 'user-data')
    const firstStore = await indexFolderInto(first, indexLocationFor(userData, first).path)
    const secondStore = await indexFolderInto(second, indexLocationFor(userData, second).path)
    const firstText = storedText(firstStore, 'shared.md')
    const secondText = storedText(secondStore, 'shared.md')
    firstStore.close()
    secondStore.close()
    assert(
      indexLocationFor(userData, first).path !== indexLocationFor(userData, second).path,
      'expected two folders to have two index files'
    )
    assert(
      secondText.includes('SECOND') && !secondText.includes('FIRST'),
      "expected the second folder's index to hold only its own text for a path both folders have"
    )
    assert(
      firstText.includes('FIRST') && !firstText.includes('SECOND'),
      'expected the first folder to keep its own text'
    )
    console.log('Same-path two-folder check passed (one index file per folder).')
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
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

    const indexer = new Indexer({ notesRoot, vectorStore: store, indexState: state })

    const first = await indexer.indexAll()
    assert(first.filesIndexed === 2, `expected 2 markdown files indexed, got ${first.filesIndexed}`)
    assert(first.chunksIndexed === 3, `expected 3 chunks indexed, got ${first.chunksIndexed}`)
    assert(store.fileCount() === 2, `expected 2 stored files, got ${store.fileCount()}`)
    assert(store.chunkCount() === 3, `expected 3 stored chunks, got ${store.chunkCount()}`)

    // A local pass alone is searchable by keyword, and every note is waiting for vectors.
    assert(
      store
        .keywordSearch('privacy boundaries', 5)
        .some((row) => row.sourcePath === 'projects/alpha.md'),
      'expected keyword search to work before any vector exists'
    )
    assert(
      state.unembeddedCount() === 2,
      `expected 2 notes waiting for vectors, got ${state.unembeddedCount()}`
    )
    await attachFakeVectors(store, state)
    assert(state.unembeddedCount() === 0, 'expected no notes waiting after attaching vectors')

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
    await sameRelativePathScenario()
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
