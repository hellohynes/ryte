import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkContract } from './check-contract.mjs'

const manifestSource = `export const manifest = {
  tasks: { operations: { list: 'tasks:list' }, events: { changed: 'tasks:changed' } }
} as const
`

// The two wiring files hold no channel: they only hand ipcMain / ipcRenderer to the registrar and the builder.
const wiring = {
  'src/main/ipc.ts': `import { ipcMain } from 'electron'\nexport const wire = (register: (ipc: unknown) => void): void => register(ipcMain)\n`,
  'src/preload/index.ts': `import { ipcRenderer } from 'electron'\nimport { createContractApi } from './contract-api'\nexport const api = createContractApi(ipcRenderer)\n`
}

// A small tree that follows every rule. Each test changes one thing and expects the matching violation.
const baseFiles = {
  'src/contract/manifest.generated.ts': manifestSource,
  'src/contract/tasks.ts': `export const list = { channel: 'tasks:list' }\nexport const changed = { channel: 'tasks:changed' }\n`,
  'src/main/contract/register.ts': `export const emit = (win: any, event: any): void => win.webContents.send(event.channel)\n`,
  'src/preload/contract-api.ts': `import { manifest } from '../contract/manifest.generated'\nexport const api = manifest\n`,
  ...wiring,
  'src/shared/tasks.ts': `export type { A } from '../contract/tasks'\n`,
  'src/renderer/src/App.vue': `<script setup lang="ts">\nconst emit = defineEmits<{ 'update:open': [boolean] }>()\nemit('update:open', true)\n</script>\n`
}

function run(changes = {}) {
  const files = { ...baseFiles, ...changes }
  for (const [path, value] of Object.entries(changes)) if (value === null) delete files[path]
  return checkContract({
    files,
    manifestSource: files['src/contract/manifest.generated.ts'] ?? ''
  })
}

const rules = (violations) => violations.map((violation) => violation.rule)
const messages = (violations) =>
  violations.map((violation) => `${violation.file}: ${violation.message}`).join('\n')

function expectViolation(changes, rule, pattern) {
  const violations = run(changes)
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
    /tasks:extra is not in the contract/
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

test('rejects event.sender.send and other send variants outside the allowed files', () => {
  for (const call of [
    `event.sender.send(name)`,
    `wc.sendSync(name)`,
    `wc.sendToFrame(1, name)`,
    `wc.postMessage(name, 1)`,
    `wc['send'](name)`,
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

test('rejects a channel built by concatenation or a template, even in a wiring file', () => {
  for (const code of [
    `ipcMain.handle('tasks' + ':evil', () => 1)`,
    'ipcMain.handle(`tasks:${name}`, () => 1)',
    `ipcRenderer.invoke('app:' + name)`,
    `win.webContents.send('app:' + 'x', 1)`,
    'wc.sendToFrame(1, `app:${name}`)'
  ]) {
    expectViolation(
      {
        'src/main/ipc.ts': `import { ipcMain } from 'electron'\n${code}\n`
      },
      'ipc-access',
      /builds its channel with concatenation or a template/
    )
  }
  // A plain identifier or property is a constant, not a built string.
  assert.deepEqual(
    run({
      'src/main/ipc.ts': `import { ipcMain } from 'electron'\nconst name = event.channel\nipcMain.removeHandler(name)\nwin.webContents.send(event.channel, 1)\n`
    }),
    []
  )
})

test('rejects a malformed channel name in an IPC call, even in a wiring file', () => {
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
        'src/main/ipc.ts': `import { ipcMain } from 'electron'\n${code}\n`
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

test('a string that merely looks like a channel has no escape hatch', () => {
  const violations = run({ 'src/main/foo.ts': `export const key = 'cache:warm'\n` })
  assert.ok(rules(violations).includes('inventory'))
  assert.match(messages(violations), /cache:warm is not in the contract/)
  assert.doesNotMatch(messages(violations), /legacy|ignore|sendAllowed/)
})

test('a worker or socket send outside the allowed files has no escape hatch either', () => {
  const violations = run({
    'src/main/worker.ts': `export const f = (w: any): void => w.postMessage(1)\n`
  })
  assert.ok(rules(violations).includes('ipc-access'))
  assert.doesNotMatch(messages(violations), /legacy|ignore|sendAllowed/)
})

// The allowlist excuses IPC primitives, never a channel string.
test('the registrar, the builder and the two wiring files may reference IPC primitives', () => {
  for (const [file, code] of Object.entries({
    'src/main/contract/register.ts': `export const f = (ipcMain: any, win: any): void => { ipcMain.handle(name, () => 1); win.webContents.send(name) }\n`,
    'src/preload/contract-api.ts': `export const f = (ipcRenderer: any): void => { ipcRenderer.invoke(name); ipcRenderer.on(name, cb); ipcRenderer.removeListener(name, cb) }\n`,
    'src/main/ipc.ts': `import { ipcMain } from 'electron'\nexport const f = (win: any): void => { ipcMain.removeHandler(name); win.webContents.send(name); win.webContents.postMessage(name, 1) }\n`,
    'src/preload/index.ts': `import { ipcRenderer } from 'electron'\nexport const f = (): void => { ipcRenderer.removeAllListeners(name) }\n`
  })) {
    assert.deepEqual(run({ [file]: code }), [], file)
  }
})

test('a file outside the allowlist may not reference ipcMain or ipcRenderer', () => {
  for (const file of [
    'src/main/other.ts',
    'src/main/index.ts',
    'src/main/contract/tasks-handlers.ts',
    'src/preload/other.ts',
    'src/shared/other.ts',
    'src/contract/other.ts'
  ]) {
    for (const name of ['ipcMain', 'ipcRenderer']) {
      expectViolation(
        { [file]: `import { ${name} } from 'electron'\nexport const x = ${name}\n` },
        'ipc-access',
        new RegExp(
          `${name} reaches IPC outside the registrar, the preload builder and the two wiring`
        )
      )
    }
  }
})

test('the allowlist matches whole paths, not look-alikes', () => {
  for (const file of [
    'src/main/sub/ipc.ts',
    'src/main/ipc.mts',
    'src/main/ipc2.ts',
    'src/preload/sub/index.ts',
    'src/preload/index.cjs',
    'src/main/contract/register.js',
    'src/preload/contract-api.tsx'
  ]) {
    expectViolation(
      { [file]: `import { ipcMain } from 'electron'\nexport const x = ipcMain\n` },
      'ipc-access',
      /ipcMain reaches IPC outside/
    )
  }
})

test('a hand-written channel string in a wiring file still fails', () => {
  for (const [file, code] of [
    [
      'src/main/ipc.ts',
      `import { ipcMain } from 'electron'\nipcMain.handle('app:brand-new', () => 1)\n`
    ],
    [
      'src/preload/index.ts',
      `import { ipcRenderer } from 'electron'\nipcRenderer.invoke('app:brand-new')\n`
    ]
  ]) {
    expectViolation({ [file]: code }, 'inventory', /app:brand-new is not in the contract/)
  }
})

test('a contract channel written as a string in a wiring file still fails', () => {
  for (const [file, code] of [
    [
      'src/main/ipc.ts',
      `import { ipcMain } from 'electron'\nipcMain.handle('tasks:list', () => 1)\n`
    ],
    [
      'src/main/ipc.ts',
      `import { ipcMain } from 'electron'\nexport const wc = (w: any): void => w.webContents.send('tasks:changed')\n`
    ],
    [
      'src/preload/index.ts',
      `import { ipcRenderer } from 'electron'\nipcRenderer.invoke('tasks:list')\n`
    ],
    [
      'src/preload/index.ts',
      `import { ipcRenderer } from 'electron'\nipcRenderer.on('tasks:changed', () => 1)\n`
    ]
  ]) {
    expectViolation({ [file]: code }, 'inventory', /tasks:(list|changed) belongs to the contract/)
  }
})

test('a channel string in src/shared or src/preload (not wiring) fails', () => {
  for (const file of ['src/shared/x.ts', 'src/preload/helper.ts', 'src/main/helper.ts']) {
    expectViolation(
      { [file]: `export const c = 'tasks:x'\n` },
      'inventory',
      /tasks:x is not in the contract/
    )
  }
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

test('a deleted manifest is still caught: the contract channels the code names have no home', () => {
  const violations = run({ 'src/contract/manifest.generated.ts': null })
  assert.ok(rules(violations).includes('inventory'), messages(violations) || '(none)')
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
