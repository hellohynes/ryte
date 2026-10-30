import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { checkContract } from './check-contract.mjs'

const manifestSource = `export const manifest = {
  tasks: { operations: { list: 'tasks:list' }, events: { changed: 'tasks:changed' } }
} as const
`

const baseLegacy = {
  files: ['src/main/ipc.ts', 'src/preload/index.ts'],
  sendAllowed: [],
  ignore: [],
  channels: { request: ['app:get-version'], event: [] }
}

// A small tree that follows every rule. Each test changes one thing and expects the matching violation.
const baseFiles = {
  'src/contract/manifest.generated.ts': manifestSource,
  'src/contract/tasks.ts': `export const list = { channel: 'tasks:list' }\nexport const changed = { channel: 'tasks:changed' }\n`,
  'src/main/contract/register.ts': `export const emit = (win: any, event: any): void => win.webContents.send(event.channel)\n`,
  'src/preload/contract-api.ts': `import { manifest } from '../contract/manifest.generated'\nexport const api = manifest\n`,
  'src/main/ipc.ts': `import { ipcMain } from 'electron'\nipcMain.handle('app:get-version', () => 1)\n`,
  'src/preload/index.ts': `import { ipcRenderer } from 'electron'\nipcRenderer.invoke('app:get-version')\n`,
  'src/shared/tasks.ts': `export type { A } from '../contract/tasks'\n`,
  'src/renderer/src/App.vue': `<script setup lang="ts">\nconst emit = defineEmits<{ 'update:open': [boolean] }>()\nemit('update:open', true)\n</script>\n`
}

function run(changes = {}, legacy = baseLegacy) {
  const files = { ...baseFiles, ...changes }
  for (const [path, value] of Object.entries(changes)) if (value === null) delete files[path]
  return checkContract({
    files,
    legacy,
    manifestSource: files['src/contract/manifest.generated.ts'] ?? ''
  })
}

const rules = (violations) => violations.map((violation) => violation.rule)
const messages = (violations) =>
  violations.map((violation) => `${violation.file}: ${violation.message}`).join('\n')

function expectViolation(changes, rule, pattern, legacy) {
  const violations = run(changes, legacy)
  assert.ok(
    rules(violations).includes(rule),
    `expected a ${rule} violation, got:\n${messages(violations) || '(none)'}`
  )
  assert.match(messages(violations), pattern)
}

test('the baseline tree follows every rule', () => {
  assert.deepEqual(run(), [])
})

test('non-channel strings in the renderer and node: specifiers are not channels', () => {
  assert.deepEqual(
    run({ 'src/main/util.ts': `import { join } from 'node:path'\nexport const j = join\n` }),
    []
  )
})

test('test files and fixtures are not checked', () => {
  assert.deepEqual(
    run({
      'src/main/ipc.test.ts': `import { ipcMain } from 'electron'\nipcMain.handle('tasks:list', () => 1)\n`,
      'src/contract/fixtures/shapes.fixture.ts': `export const c = 'fixture:status-event'\n`
    }),
    []
  )
})

test('rejects a raw handler for a new channel in a new file', () => {
  expectViolation(
    {
      'src/main/new-area.ts': `import { ipcMain } from 'electron'\nipcMain.handle('tasks:extra', () => 1)\n`
    },
    'ipc-access',
    /ipcMain reaches IPC outside/
  )
  expectViolation(
    { 'src/main/new-area.ts': `ipcMain.handle('tasks:extra', () => 1)\n` },
    'inventory',
    /tasks:extra is not in the contract or scripts\/legacy.json/
  )
})

test('a channel defined in src/contract/ but missing from the manifest says to regenerate', () => {
  expectViolation(
    { 'src/contract/ping.ts': `export const ping = { channel: 'tasks:ping' }\n` },
    'inventory',
    /missing from the generated manifest; run `pnpm contract:generate`/
  )
})

test('rejects a raw send of a contract event, outside the contract', () => {
  const violations = run({
    'src/main/foo.ts': `export const f = (win: any): void => win.webContents.send('tasks:changed')\n`
  })
  assert.ok(rules(violations).includes('ipc-access'))
  assert.match(messages(violations), /tasks:changed belongs to the contract/)
})

test('rejects event.sender.send and other send variants outside the listed files', () => {
  for (const call of [
    `event.sender.send('app:get-version')`,
    `wc.sendSync('app:get-version')`,
    `wc.sendToFrame(1, 'app:get-version')`,
    `wc.postMessage('app:get-version', 1)`,
    `wc['send']('app:get-version')`,
    `const { send } = win.webContents`
  ]) {
    expectViolation({ 'src/main/foo.ts': `${call}\n` }, 'ipc-access', /reaches IPC outside/)
  }
})

test('rejects aliasing ipcMain or ipcRenderer in a new file', () => {
  for (const code of [
    `import { ipcRenderer } from 'electron'\nconst r = ipcRenderer\n`,
    `import { ipcMain } from 'electron'\nconst { handle } = ipcMain\n`,
    `import * as e from 'electron'\nexport const x = e.ipcMain\n`,
    `import * as e from 'electron'\nexport const x = e['ipcMain']\n`,
    `const { ipcMain } = require('electron')\n`
  ]) {
    expectViolation({ 'src/main/foo.ts': code }, 'ipc-access', /reaches IPC outside/)
  }
})

test('scans every script extension, not only .ts', () => {
  for (const file of [
    'evil.js',
    'evil.mjs',
    'evil.cjs',
    'evil.mts',
    'evil.cts',
    'evil.tsx',
    'evil.jsx'
  ]) {
    expectViolation(
      { [`src/main/${file}`]: `ipcMain.handle('tasks:evil', () => 1)\n` },
      'ipc-access',
      /ipcMain reaches IPC outside/
    )
  }
  assert.deepEqual(
    run({ 'src/main/skipped.test.js': `ipcMain.handle('tasks:evil', () => 1)\n` }),
    []
  )
  assert.deepEqual(run({ 'src/main/types.d.mts': `export declare const x: string\n` }), [])
})

test('rejects a channel built by concatenation or a template, even in a legacy file', () => {
  for (const code of [
    `ipcMain.handle('tasks' + ':evil', () => 1)`,
    'ipcMain.handle(`tasks:${name}`, () => 1)',
    `ipcRenderer.invoke('app:' + name)`,
    `win.webContents.send('app:' + 'x', 1)`,
    'wc.sendToFrame(1, `app:${name}`)'
  ]) {
    expectViolation(
      {
        'src/main/ipc.ts': `import { ipcMain } from 'electron'\nipcMain.handle('app:get-version', () => 1)\n${code}\n`
      },
      'ipc-access',
      /builds its channel with concatenation or a template/
    )
  }
  // A plain identifier or property is a constant, not a built string.
  assert.deepEqual(
    run({
      'src/main/ipc.ts': `import { ipcMain } from 'electron'\nipcMain.handle('app:get-version', () => 1)\nconst name = 'app:get-version'\nipcMain.removeHandler(name)\nwin.webContents.send(event.channel, 1)\n`
    }),
    []
  )
})

test('rejects a malformed channel name in an IPC call, even in a legacy file', () => {
  for (const code of [
    `ipcMain.handle('files:readAll', () => 1)`,
    `ipcMain.handle('files:read_all', () => 1)`,
    `ipcMain.handle('read', () => 1)`,
    `ipcRenderer.invoke('files:2fa')`,
    `ipcRenderer.on('Files:read', cb)`,
    `event.sender.send('files:a:b')`,
    `win.webContents.send('Files')`,
    `win.webContents.sendToFrame(1, 'badName')`,
    `contents.ipc.handle('files:readAll', () => 1)`
  ]) {
    expectViolation(
      {
        'src/main/ipc.ts': `import { ipcMain } from 'electron'\nipcMain.handle('app:get-version', () => 1)\n${code}\n`
      },
      'inventory',
      /is not a valid channel name/
    )
  }
})

test('other Electron events on webContents are not channels', () => {
  assert.deepEqual(
    run({
      'src/main/nav.ts': `export const f = (w: any): void => { w.webContents.on('will-navigate', () => 1) }\n`
    }),
    []
  )
})

test('the webContents .ipc object counts as IPC access', () => {
  expectViolation(
    {
      'src/main/foo.ts': `export const f = (e: any) => e.sender.ipc.handle('files:readall', () => 1)\n`
    },
    'ipc-access',
    /ipc reaches IPC outside/
  )
})

test('the messages say what to do about a false positive', () => {
  expectViolation(
    { 'src/main/foo.ts': `export const key = 'cache:warm'\n` },
    'inventory',
    /add it to "ignore" in scripts\/legacy.json with a reason/
  )
  expectViolation(
    { 'src/main/worker.ts': `export const f = (w: any): void => w.postMessage(1)\n` },
    'ipc-access',
    /list the file in "sendAllowed" in scripts\/legacy.json with a reason/
  )
})

test('rejects a new channel literal in a legacy file, and one in the preload', () => {
  expectViolation(
    {
      'src/preload/index.ts': `import { ipcRenderer } from 'electron'\nipcRenderer.invoke('app:get-version')\nipcRenderer.invoke('app:brand-new')\n`
    },
    'inventory',
    /app:brand-new is not in the contract/
  )
})

test('rejects a contract channel written as a string outside the contract', () => {
  expectViolation(
    {
      'src/preload/index.ts': `import { ipcRenderer } from 'electron'\nipcRenderer.invoke('app:get-version')\nipcRenderer.invoke('tasks:list')\n`
    },
    'inventory',
    /tasks:list belongs to the contract/
  )
})

test('rejects a channel that is both a contract channel and a legacy channel', () => {
  expectViolation({}, 'inventory', /tasks:list is a contract channel and a legacy channel/, {
    ...baseLegacy,
    channels: { request: ['app:get-version', 'tasks:list'], event: [] }
  })
})

test('rejects a stale legacy channel and a stale legacy file', () => {
  expectViolation({}, 'inventory', /app:gone no longer appears/, {
    ...baseLegacy,
    channels: { request: ['app:get-version', 'app:gone'], event: [] }
  })
  expectViolation(
    { 'src/preload/index.ts': `export const none = 1\n` },
    'ipc-access',
    /src\/preload\/index.ts no longer reaches IPC/,
    { ...baseLegacy, channels: { request: ['app:get-version'], event: [] } }
  )
  expectViolation({ 'src/main/ipc.ts': null }, 'ipc-access', /does not exist/)
})

test('rejects electron, including a type-only import, inside src/contract', () => {
  expectViolation(
    {
      'src/contract/define.ts': `import type { WebContents } from 'electron'\nexport type W = WebContents\n`
    },
    'imports',
    /src\/contract\/ must not import electron/
  )
})

test('rejects a manifest that imports anything', () => {
  expectViolation(
    { 'src/contract/manifest.generated.ts': `import { z } from 'zod'\n${manifestSource}` },
    'imports',
    /generated manifest must import nothing/
  )
})

test('rejects value imports of the contract outside main and the builder, accepts type imports', () => {
  for (const code of [
    `import { list } from '../contract/tasks'\nexport const x = list\n`,
    `export * from '../contract/tasks'\n`,
    `export { list } from '../contract/tasks'\n`,
    `export const load = () => import('../contract/tasks')\n`,
    `const tasks = require('../contract/tasks')\n`,
    `import '../contract/tasks'\n`
  ]) {
    expectViolation({ 'src/shared/leak.ts': code }, 'imports', /may value-import src\/contract/)
  }
  expectViolation(
    {
      'src/preload/other.ts': `import { manifest } from '../contract/manifest.generated'\nexport const m = manifest\n`
    },
    'imports',
    /may value-import src\/contract/
  )
  expectViolation(
    {
      'src/preload/contract-api.ts': `import { list } from '../contract/tasks'\nexport const x = list\n`
    },
    'imports',
    /manifest only/
  )
  assert.deepEqual(
    run({
      'src/shared/types.ts': `import type { A } from '../contract/tasks'\nimport { type B } from '../contract/tasks'\nexport type T = [A, B]\n`,
      'src/main/uses.ts': `import { list } from '../contract/tasks'\nexport const x = list\n`
    }),
    []
  )
})

test('rejects ipcRenderer, electron and contract value imports in the renderer, vue files included', () => {
  expectViolation(
    {
      'src/renderer/src/Bad.vue': `<script setup lang="ts">\nimport { ipcRenderer } from 'electron'\nipcRenderer.send('app:get-version')\n</script>\n`
    },
    'renderer',
    /must not reference ipcRenderer/
  )
  expectViolation(
    { 'src/renderer/src/bad.ts': `import { shell } from 'electron'\nexport const s = shell\n` },
    'renderer',
    /must not import electron/
  )
  expectViolation(
    {
      'src/renderer/src/value.ts': `import { list } from '../../contract/tasks'\nexport const l = list\n`
    },
    'imports',
    /renderer must not value-import/
  )
  assert.deepEqual(
    run({
      'src/renderer/src/ok.ts': `import type { A } from '../../contract/tasks'\nexport type T = A\n`
    }),
    []
  )
})

test('an ignore entry removes a false positive and goes stale when unused', () => {
  const withIgnore = {
    ...baseLegacy,
    ignore: [{ channel: 'ui:toggle', reason: 'a DOM event name' }]
  }
  assert.deepEqual(run({ 'src/main/ui.ts': `export const e = 'ui:toggle'\n` }, withIgnore), [])
  expectViolation({}, 'inventory', /ignored channel ui:toggle no longer appears/, withIgnore)
})

test('a sendAllowed file may call send, and needs a reason', () => {
  const allowed = {
    ...baseLegacy,
    sendAllowed: [{ file: 'src/main/socket.ts', reason: 'a websocket, not IPC' }]
  }
  assert.deepEqual(
    run({ 'src/main/socket.ts': `export const s = (ws: any): void => ws.send('hi')\n` }, allowed),
    []
  )
  expectViolation(
    { 'src/main/socket.ts': `export const s = (ws: any): void => ws.send('hi')\n` },
    'ipc-access',
    /needs a reason/,
    { ...baseLegacy, sendAllowed: [{ file: 'src/main/socket.ts' }] }
  )
})

// The ratchet: scripts/legacy.json can only shrink. The numbers are exact on purpose, so a migration that
// shrinks the list must lower them here, and nothing can grow the list back to an old ceiling without a
// deliberate edit of this test. Raising them needs a reason in the change that does it.
test('legacy.json does not grow', () => {
  const legacy = JSON.parse(
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'legacy.json'), 'utf8')
  )
  assert.equal(legacy.channels.request.length, 42, 'request channels')
  assert.equal(legacy.channels.event.length, 14, 'event channels')
  assert.equal(legacy.files.length, 3, 'legacy files')
  assert.deepEqual(legacy.sendAllowed, [], 'sendAllowed')
  assert.deepEqual(legacy.ignore, [], 'ignore')
})
