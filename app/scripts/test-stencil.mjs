// Runs the Stencil keyboard contract tests in real Chromium: builds the gallery, then drives it in the
// repo's Electron (a hidden window, real input events). Usage: pnpm test:stencil
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronPath = require('electron')

const build = spawnSync('pnpm', ['stencil:build'], { stdio: 'inherit' })
if (build.status !== 0) {
  console.error('The gallery build failed.')
  process.exit(build.status ?? 1)
}

const electron = spawn(electronPath, ['scripts/stencil-test/main.mjs'], { stdio: 'inherit' })
electron.once('error', (error) => {
  console.error(`Failed to start Electron: ${error.message}`)
  process.exit(1)
})
electron.once('close', (code, signal) => {
  if (signal) console.error(`Electron exited from signal ${signal}.`)
  process.exit(code ?? 1)
})
