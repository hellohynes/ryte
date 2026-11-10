import {
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_CODE_FILE_BYTES } from '../../shared/code-files'
import { createCodeHandlers } from './code-handlers'

const ctx = { sender: {} as never }

describe('code:read', () => {
  let root: string
  let outside: string
  let handlers: ReturnType<typeof createCodeHandlers>

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ryte-code-root-')))
    outside = mkdtempSync(join(tmpdir(), 'ryte-code-outside-'))
    handlers = createCodeHandlers({ getNotesRoot: () => root, openPath: vi.fn(async () => '') })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  it('reads a code file as text, dropping a leading BOM', async () => {
    writeFileSync(join(root, 'Build.TS'), 'export const answer = 42\n')
    writeFileSync(join(root, 'bom.json'), '\uFEFF{"a":1}')

    await expect(handlers.read({ path: 'Build.TS' }, ctx)).resolves.toEqual({
      status: 'ok',
      text: 'export const answer = 42\n',
      bytes: 25
    })
    await expect(handlers.read({ path: 'bom.json' }, ctx)).resolves.toEqual({
      status: 'ok',
      text: '{"a":1}',
      bytes: 10
    })
  })

  it('refuses a link that points outside the notes folder', async () => {
    writeFileSync(join(outside, 'secret.ts'), 'secret')
    symlinkSync(join(outside, 'secret.ts'), join(root, 'link.ts'))

    await expect(handlers.read({ path: 'link.ts' }, ctx)).resolves.toEqual({ status: 'blocked' })
  })

  it('refuses a type that is not on the list, including a code-named link to a note', async () => {
    writeFileSync(join(root, 'page.html'), '<p>hi</p>')
    writeFileSync(join(root, 'note.md'), '# Note')
    symlinkSync(join(root, 'note.md'), join(root, 'disguised.ts'))

    await expect(handlers.read({ path: 'page.html' }, ctx)).resolves.toEqual({ status: 'blocked' })
    await expect(handlers.read({ path: 'note.md' }, ctx)).resolves.toEqual({ status: 'blocked' })
    await expect(handlers.read({ path: 'disguised.ts' }, ctx)).resolves.toEqual({
      status: 'blocked'
    })
  })

  it('reports a file over the cap with its size, without reading it', async () => {
    const big = join(root, 'big.json')
    writeFileSync(big, '')
    truncateSync(big, MAX_CODE_FILE_BYTES + 1)

    await expect(handlers.read({ path: 'big.json' }, ctx)).resolves.toEqual({
      status: 'too-large',
      sizeBytes: MAX_CODE_FILE_BYTES + 1
    })
  })

  it('reports a file that is gone', async () => {
    await expect(handlers.read({ path: 'gone.ts' }, ctx)).resolves.toEqual({ status: 'missing' })
  })
})

describe('code:open-in-default-app', () => {
  let root: string

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ryte-code-open-')))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('refuses a script and opens a type that is safe, by its real path', async () => {
    const openPath = vi.fn(async () => '')
    const handlers = createCodeHandlers({ getNotesRoot: () => root, openPath })
    writeFileSync(join(root, 'run.sh'), 'echo hi')
    writeFileSync(join(root, 'data.json'), '{}')

    await expect(handlers.openInDefaultApp({ path: 'run.sh' }, ctx)).resolves.toEqual({
      opened: false
    })
    expect(openPath).not.toHaveBeenCalled()

    await expect(handlers.openInDefaultApp({ path: 'data.json' }, ctx)).resolves.toEqual({
      opened: true
    })
    expect(openPath).toHaveBeenCalledWith(join(root, 'data.json'))
  })
})
