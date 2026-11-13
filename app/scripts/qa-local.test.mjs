import assert from 'node:assert/strict'
import { test } from 'node:test'

import { indexingChanged } from './qa-local.mjs'

test('indexing and watcher code pulls in the watcher scenarios and the indexer smoke', () => {
  assert.equal(indexingChanged(['README.md', 'app/src/main/indexing/watcher.ts']), true)
  assert.equal(indexingChanged(['app/scripts/smoke-indexer-fixture.ts']), true)
  assert.equal(indexingChanged(['app/src/shared/supported-types.ts']), true)
})

test('other changes keep the fast path fast', () => {
  assert.equal(indexingChanged([]), false)
  assert.equal(
    indexingChanged([
      'app/src/renderer/src/App.vue',
      'app/src/main/ipc.ts',
      'docs/branch-workflow.md',
      'site/index.html'
    ]),
    false
  )
})
