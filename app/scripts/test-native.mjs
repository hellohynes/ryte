import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

// The native indexer tests need better-sqlite3 built for Electron, so they run inside the Electron binary acting as plain Node.
const electronBinary = createRequire(import.meta.url)('electron')

const result = spawnSync(
  electronBinary,
  ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.native.config.mjs'],
  { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
)
if (result.error) throw result.error
process.exit(result.status ?? 1)
