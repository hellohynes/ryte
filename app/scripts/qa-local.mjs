// The fast `pnpm qa:local` path: lint, type check once, tests, bundle build, launch.
// `pnpm validate` runs everything and is what CI and every PR use.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Code the watcher scenarios and the indexer smoke exercise. A change here adds both to the fast path.
const INDEXING_PATHS = [
  'app/src/main/indexing/',
  'app/src/shared/supported-types',
  'app/scripts/smoke-indexer',
  'app/scripts/run-indexer-smoke.mjs',
  'app/pnpm-lock.yaml'
]

export function indexingChanged(paths) {
  return paths.some((path) => INDEXING_PATHS.some((prefix) => path.startsWith(prefix)))
}

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' })
  if (result.error || result.status !== 0) throw new Error(`git ${args.join(' ')} failed`)
  return result.stdout.split('\n').filter(Boolean)
}

// Commits since the merge-base with origin/main, plus the working tree and untracked files.
// When that cannot be worked out, assume indexing changed so nothing is skipped by mistake.
export function changedPaths() {
  try {
    const base = git(['merge-base', 'HEAD', 'origin/main'])[0]
    return [
      ...git(['diff', '--name-only', base]),
      ...git(['ls-files', '--others', '--exclude-standard'])
    ]
  } catch {
    return null
  }
}

function step(label, args) {
  console.log(`\n> ${label}`)
  const result = spawnSync('pnpm', args, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function main() {
  const paths = changedPaths()
  const withIndexing = paths === null || indexingChanged(paths)

  const skipped = ['the Stencil, site and contract checks', 'native tests', 'release-script tests']
  if (!withIndexing) skipped.push('the watcher scenarios', 'the indexer smoke')
  console.log(
    `Fast path: skips ${skipped.join(', ')}. Run \`pnpm validate\` for everything.` +
      (withIndexing ? ' Indexing code changed (or could not be checked), so the watcher scenarios and the indexer smoke run.' : '')
  )

  step('check:node', ['check:node'])
  step('lint', ['lint'])
  step('typecheck', ['typecheck'])
  step('test', withIndexing ? ['test'] : ['test', '--exclude', '**/watcher.scenarios.test.ts'])
  step('build:bundle', ['build:bundle'])
  if (withIndexing) step('smoke:indexer', ['smoke:indexer'])
  if (!process.argv.includes('--no-launch')) step('launch', ['launch'])
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
