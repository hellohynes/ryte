import { spawnSync } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run(label, command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`)
  }
}

let failed = false

try {
  run('Node native rebuild', npmCommand, ['rebuild', 'better-sqlite3'])
  run('Safe indexer smoke', process.execPath, [
    '--import',
    'tsx',
    'scripts/smoke-indexer-fixture.ts'
  ])
} catch (error) {
  failed = true
  console.error(error instanceof Error ? error.message : String(error))
} finally {
  try {
    run('Electron native rebuild', npmCommand, ['run', 'rebuild:electron'])
  } catch (error) {
    failed = true
    console.error(error instanceof Error ? error.message : String(error))
  }
}

if (failed) process.exit(1)
