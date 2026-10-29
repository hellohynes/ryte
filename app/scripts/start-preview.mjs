import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const electronArgs = process.argv.slice(2)

console.log('starting electron app...')

const electron = spawn(electronPath, ['.', ...electronArgs], {
  stdio: 'inherit'
})

let failedToStart = false

electron.once('error', (error) => {
  failedToStart = true
  console.error(`Failed to start Electron: ${error.message}`)
  process.exitCode = 1
})

electron.once('close', (code, signal) => {
  if (failedToStart) return

  if (signal) {
    console.error(`Electron exited from signal ${signal}.`)
    process.exitCode = 1
    return
  }

  process.exitCode = code ?? 1
})
