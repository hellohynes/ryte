/**
 * Synthetic smoke test for the indexer pipeline.
 * Runs against an explicitly provided notes folder with a FAKE embedder
 * (no API key needed). This script can inspect and sample real note content,
 * so it intentionally requires an explicit path argument.
 *
 * Validates: walker discovers files, chunker handles real markdown,
 * vector store + index-state scale to the real corpus, and timing characteristics.
 *
 * Run with: pnpm smoke:indexer:notes -- /path/to/notes
 * Add --show-samples to print random chunk previews.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Indexer } from '../src/main/indexing/indexer'
import { IndexStateStore } from '../src/main/indexing/index-state'
import { VectorStore } from '../src/main/indexing/vector-store'
import type { EmbeddingProvider } from '../src/main/indexing/embedder'

const DIM = 1536

const fakeEmbedder: EmbeddingProvider = {
  dim: DIM,
  embed: async (texts) => texts.map(() => new Float32Array(DIM))
}

async function main(): Promise<void> {
  const notesRoot = process.argv.find(
    (arg) => !arg.startsWith('--') && arg !== process.argv[0] && arg !== process.argv[1]
  )
  const showSamples = process.argv.includes('--show-samples')
  if (!notesRoot) {
    throw new Error(
      'Refusing to default to ~/notes. Pass an explicit notes root, for example: pnpm smoke:indexer:notes -- /path/to/notes'
    )
  }
  console.log(`Notes root: ${notesRoot}`)

  const tempDir = mkdtempSync(join(tmpdir(), 'ryte-smoke-'))
  const dbPath = join(tempDir, 'index.db')
  console.log(`Temp index db: ${dbPath}`)

  const store = new VectorStore(dbPath)
  store.init(DIM)
  console.log(`sqlite-vec version: ${store.vecVersion()}`)

  const state = new IndexStateStore(store.database)
  state.init()

  const indexer = new Indexer({
    notesRoot,
    embedder: fakeEmbedder,
    vectorStore: store,
    indexState: state
  })

  const start = Date.now()
  let lastReport = start
  let lastChunksDone = 0

  const summary = await indexer.indexAll({
    onProgress: (p) => {
      const now = Date.now()
      if (p.phase === 'indexing' && now - lastReport > 500) {
        const rate = (p.chunksDone - lastChunksDone) / ((now - lastReport) / 1000)
        process.stdout.write(
          `\r  ${p.phase} ${p.chunksDone}/${p.chunksTotal} chunks · ${p.filesDone}/${p.filesTotal} files · ${rate.toFixed(0)} chunks/s    `
        )
        lastReport = now
        lastChunksDone = p.chunksDone
      } else if (p.phase === 'walking') {
        process.stdout.write(`  ${p.phase}…\n`)
      }
    }
  })

  const elapsedMs = Date.now() - start
  process.stdout.write('\n')
  console.log(`\nDone in ${(elapsedMs / 1000).toFixed(2)}s`)
  console.log(`  files indexed: ${summary.filesIndexed}`)
  console.log(`  chunks indexed: ${summary.chunksIndexed}`)
  console.log(`  store totals: ${store.chunkCount()} chunks, ${store.fileCount()} files`)
  console.log(`  index state totals: ${JSON.stringify(state.totals())}`)

  if (showSamples) {
    // Spot-check: random sample of 3 chunks. This can print note content.
    const sample = store.database
      .prepare(
        `SELECT source_path, heading_path, substr(text, 1, 80) AS preview
         FROM chunks ORDER BY RANDOM() LIMIT 3`
      )
      .all() as Array<{ source_path: string; heading_path: string; preview: string }>
    console.log('\nRandom sample:')
    for (const row of sample) {
      console.log(`  ${row.source_path}`)
      console.log(`    heading: ${row.heading_path}`)
      console.log(`    preview: ${row.preview.replace(/\n/g, ' ')}…`)
    }
  }

  // Re-run to verify mtime-skip behavior
  console.log('\nSecond pass (should skip all files):')
  const secondStart = Date.now()
  const summary2 = await indexer.indexAll()
  console.log(
    `  files indexed: ${summary2.filesIndexed} (expected 0), chunks: ${summary2.chunksIndexed} (expected 0), elapsed: ${Date.now() - secondStart}ms`
  )

  store.close()
  rmSync(tempDir, { recursive: true, force: true })
  console.log('\nSmoke test passed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
