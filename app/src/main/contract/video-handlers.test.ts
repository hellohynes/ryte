import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createVideoHandlers } from './video-handlers'

const ctx = { sender: {} as never }

describe('video handlers', () => {
  let root: string
  let outside: string
  let openPath: ReturnType<typeof vi.fn<(path: string) => Promise<string>>>
  let handlers: ReturnType<typeof createVideoHandlers>

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ryte-vid-root-')))
    outside = mkdtempSync(join(tmpdir(), 'ryte-vid-outside-'))
    mkdirSync(join(root, 'clips'))
    writeFileSync(join(root, 'clips', 'demo.mp4'), 'mp4')
    writeFileSync(join(root, 'clips', 'demo.mkv'), 'mkv')
    writeFileSync(join(outside, 'secret.mp4'), 'mp4')
    openPath = vi.fn(async () => '')
    handlers = createVideoHandlers({ getNotesRoot: () => root, openPath })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  describe('explain', () => {
    it('reports a missing video', async () => {
      await expect(handlers.explain({ path: 'clips/gone.mp4' }, ctx)).resolves.toEqual({
        reason: 'missing',
        sizeBytes: null
      })
    })

    it('reports a type Ryte does not play as blocked', async () => {
      await expect(handlers.explain({ path: 'clips/demo.mkv' }, ctx)).resolves.toEqual({
        reason: 'blocked',
        sizeBytes: null
      })
    })

    it('reports a link outside the notes folder as blocked', async () => {
      symlinkSync(join(outside, 'secret.mp4'), join(root, 'link.mp4'))
      await expect(handlers.explain({ path: 'link.mp4' }, ctx)).resolves.toEqual({
        reason: 'blocked',
        sizeBytes: null
      })
    })
  })

  describe('openInDefaultApp', () => {
    it('opens a video by its real path', async () => {
      await expect(handlers.openInDefaultApp({ path: 'clips/demo.mp4' }, ctx)).resolves.toEqual({
        opened: true
      })
      expect(openPath).toHaveBeenCalledWith(join(root, 'clips', 'demo.mp4'))
    })

    it('never opens a link that points outside the notes folder, or a type Ryte does not play', async () => {
      symlinkSync(join(outside, 'secret.mp4'), join(root, 'link.mp4'))
      await expect(handlers.openInDefaultApp({ path: 'link.mp4' }, ctx)).resolves.toEqual({
        opened: false
      })
      await expect(handlers.openInDefaultApp({ path: 'clips/demo.mkv' }, ctx)).resolves.toEqual({
        opened: false
      })
      expect(openPath).not.toHaveBeenCalled()
    })
  })
})
