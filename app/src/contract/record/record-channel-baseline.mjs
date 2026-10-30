// ONE-SHOT. Records the channel inventory of the pre-change code into `channels.baseline.json`: every
// channel-shaped string literal in non-test src/main, src/preload and src/shared, excluding `node:` module
// names. Request channels are those registered with ipcMain.handle; the rest are events. Retired in V4.
// Run from `app/` on the untouched code: node src/contract/record/record-channel-baseline.mjs
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const srcRoot = resolve(import.meta.dirname, '../..')
const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (path.endsWith('.ts') && !/\.test\.ts$|\.d\.ts$/.test(path)) files.push(path)
  }
}
for (const root of ['main', 'preload', 'shared']) walk(join(srcRoot, root))

const channelLiteral = /(['"`])([a-z][a-z0-9]*(?:-[a-z0-9]+)*:[a-z][a-z0-9]*(?:-[a-z0-9]+)*)\1/g
const handled = /ipcMain\.handle\(\s*'([^']+)'/g
const all = new Set()
const requests = new Set()
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(channelLiteral)) all.add(match[2])
  for (const match of source.matchAll(handled)) requests.add(match[1])
}
for (const name of [...all]) if (name.startsWith('node:')) all.delete(name)

const request = [...requests].sort()
const events = [...all].filter((name) => !requests.has(name)).sort()
if (request.length !== 45 || events.length !== 15) {
  throw new Error(
    `Unexpected inventory: ${request.length} request and ${events.length} event channels`
  )
}

const header = {
  recordedFrom: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
  command: 'node src/contract/record/record-channel-baseline.mjs',
  note: 'Frozen oracle for the wire channel names. Retired in V4 when legacy.json replaces it.'
}
writeFileSync(
  resolve(import.meta.dirname, '../channels.baseline.json'),
  `${JSON.stringify({ header, request, events }, null, 2)}\n`
)
console.log(`Recorded ${request.length} request and ${events.length} event channels`)
