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

import { contract } from '../../contract'
import { MAX_NOTE_PICTURE_BYTES } from '../../shared/note-pictures'
import { createPicturesHandlers } from './pictures-handlers'
import { registerOperations } from './register'

const ctx = { sender: {} as never }

describe('pictures handlers', () => {
  let root: string
  let outside: string
  let openPath: ReturnType<typeof vi.fn<(path: string) => Promise<string>>>
  let handlers: ReturnType<typeof createPicturesHandlers>

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ryte-pic-root-')))
    outside = mkdtempSync(join(tmpdir(), 'ryte-pic-outside-'))
    writeFileSync(join(root, 'small.png'), 'png')
    writeFileSync(join(root, 'drawing.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    writeFileSync(join(outside, 'secret.png'), 'png')
    const big = join(root, 'big.jpg')
    writeFileSync(big, '')
    truncateSync(big, MAX_NOTE_PICTURE_BYTES + 1)
    openPath = vi.fn(async () => '')
    handlers = createPicturesHandlers({ getNotesRoot: () => root, openPath })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  describe('explain', () => {
    it('reports a picture over the cap with its size', async () => {
      await expect(handlers.explain({ path: 'big.jpg' }, ctx)).resolves.toEqual({
        reason: 'too-large',
        sizeBytes: MAX_NOTE_PICTURE_BYTES + 1
      })
    })

    it('reports a missing picture', async () => {
      await expect(handlers.explain({ path: 'gone.png' }, ctx)).resolves.toEqual({
        reason: 'missing',
        sizeBytes: null
      })
    })

    it('reports a link outside the notes folder as blocked', async () => {
      symlinkSync(join(outside, 'secret.png'), join(root, 'link.png'))
      await expect(handlers.explain({ path: 'link.png' }, ctx)).resolves.toEqual({
        reason: 'blocked',
        sizeBytes: null
      })
    })

    it('reports a picture that passes every check as unreadable', async () => {
      await expect(handlers.explain({ path: 'small.png' }, ctx)).resolves.toEqual({
        reason: 'unreadable',
        sizeBytes: 3
      })
    })
  })

  describe('openInDefaultApp', () => {
    it('opens a raster picture of any size by its real path', async () => {
      await expect(handlers.openInDefaultApp({ path: 'big.jpg' }, ctx)).resolves.toEqual({
        opened: true
      })
      expect(openPath).toHaveBeenCalledWith(join(root, 'big.jpg'))
    })

    it('never opens an SVG', async () => {
      await expect(handlers.openInDefaultApp({ path: 'drawing.svg' }, ctx)).resolves.toEqual({
        opened: false
      })
      expect(openPath).not.toHaveBeenCalled()
    })

    it('never opens a link that points outside the notes folder', async () => {
      symlinkSync(join(outside, 'secret.png'), join(root, 'link.png'))
      await expect(handlers.openInDefaultApp({ path: 'link.png' }, ctx)).resolves.toEqual({
        opened: false
      })
      expect(openPath).not.toHaveBeenCalled()
    })
  })

  it('rejects a path that leaves the notes folder before the handler runs', async () => {
    const handled = new Map<string, (event: { sender: never }, ...args: unknown[]) => unknown>()
    registerOperations(
      { handle: (channel, listener) => handled.set(channel, listener as never) },
      { pictures: contract.pictures },
      { pictures: handlers }
    )
    const listener = handled.get('pictures:open-in-default-app')!

    await expect(listener(ctx, { path: '../secret.png' })).rejects.toThrow(
      'Invalid pictures.openInDefaultApp input'
    )
    expect(openPath).not.toHaveBeenCalled()
  })
})
