import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PageBox } from '../page/page-box'
import { createPageHandlers } from './page-handlers'

const sender = {} as never
const ctx = { sender }

describe('page handlers', () => {
  let root: string
  let outside: string
  let openPath: ReturnType<typeof vi.fn<(path: string) => Promise<string>>>
  let box: { show: ReturnType<typeof vi.fn> }
  let handlers: ReturnType<typeof createPageHandlers>

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ryte-page-root-')))
    outside = mkdtempSync(join(tmpdir(), 'ryte-page-outside-'))
    mkdirSync(join(root, 'review'))
    writeFileSync(join(root, 'review', 'index.html'), '<p>hi</p>')
    writeFileSync(join(root, 'review', 'old.HTM'), '<p>hi</p>')
    writeFileSync(join(root, 'review', 'notes.md'), '# hi')
    writeFileSync(join(root, 'review', 'app.js'), '1')
    writeFileSync(join(outside, 'secret.html'), '<p>no</p>')
    openPath = vi.fn(async () => '')
    box = { show: vi.fn(async () => 'shown') }
    handlers = createPageHandlers({
      box: box as unknown as PageBox,
      getNotesRoot: () => root,
      openPath
    })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  describe('openInBrowser', () => {
    it('opens an HTML page by its real path, whatever the extension case', async () => {
      await expect(handlers.openInBrowser({ path: 'review/index.html' }, ctx)).resolves.toEqual({
        opened: true
      })
      await expect(handlers.openInBrowser({ path: 'review/old.HTM' }, ctx)).resolves.toEqual({
        opened: true
      })
      expect(openPath).toHaveBeenNthCalledWith(1, join(root, 'review', 'index.html'))
      expect(openPath).toHaveBeenNthCalledWith(2, join(root, 'review', 'old.HTM'))
    })

    it('never opens a file that is not an HTML page, even through a link named .html', async () => {
      symlinkSync(join(root, 'review', 'notes.md'), join(root, 'review', 'disguised.html'))
      for (const path of ['review/notes.md', 'review/app.js', 'review/disguised.html']) {
        await expect(handlers.openInBrowser({ path }, ctx)).resolves.toEqual({ opened: false })
      }
      expect(openPath).not.toHaveBeenCalled()
    })

    it('never opens an HTML link that points outside the notes folder', async () => {
      symlinkSync(join(outside, 'secret.html'), join(root, 'link.html'))
      await expect(handlers.openInBrowser({ path: 'link.html' }, ctx)).resolves.toEqual({
        opened: false
      })
      expect(openPath).not.toHaveBeenCalled()
    })

    it('says it did not open a missing page, or one the system could not open', async () => {
      await expect(handlers.openInBrowser({ path: 'review/gone.html' }, ctx)).resolves.toEqual({
        opened: false
      })
      expect(openPath).not.toHaveBeenCalled()
      openPath.mockResolvedValueOnce('no application')
      await expect(handlers.openInBrowser({ path: 'review/index.html' }, ctx)).resolves.toEqual({
        opened: false
      })
    })
  })

  it('show hands the window, path and bounds to the box and wraps its status', async () => {
    const bounds = { x: 1, y: 2, width: 3, height: 4 }
    await expect(handlers.show({ path: 'review/index.html', bounds }, ctx)).resolves.toEqual({
      status: 'shown'
    })
    expect(box.show).toHaveBeenCalledWith(sender, 'review/index.html', bounds)
  })
})
