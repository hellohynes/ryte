import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { changedPaths, indexingChanged } from './qa-local.mjs'

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

// A throwaway repo shaped like Ryte: one commit that is also origin/main, work run from app/.
function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'ryte-qa-local-'))
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  git('config', 'commit.gpgsign', 'false')
  mkdirSync(join(repo, 'app/src/main/indexing'), { recursive: true })
  mkdirSync(join(repo, 'app/src/renderer'), { recursive: true })
  writeFileSync(join(repo, 'app/src/renderer/App.vue'), '<template />\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'init')
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  return { repo, git, cwd: join(repo, 'app') }
}

test('a new untracked indexing file is seen when run from app/', () => {
  const { repo, cwd } = makeRepo()
  try {
    writeFileSync(join(repo, 'app/src/main/indexing/new.ts'), 'export {}\n')
    assert.equal(indexingChanged(changedPaths(cwd)), true)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('a committed indexing change on a branch is seen, an unrelated one is not', () => {
  const { repo, git, cwd } = makeRepo()
  try {
    git('switch', '-q', '-c', 'feat/other')
    writeFileSync(join(repo, 'app/src/renderer/App.vue'), '<template><p /></template>\n')
    git('commit', '-q', '-am', 'ui')
    assert.equal(indexingChanged(changedPaths(cwd)), false)

    writeFileSync(join(repo, 'app/src/main/indexing/walker.ts'), 'export {}\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'indexing')
    assert.equal(indexingChanged(changedPaths(cwd)), true)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('when the merge-base cannot be found, everything runs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ryte-qa-local-'))
  try {
    assert.equal(changedPaths(dir), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
