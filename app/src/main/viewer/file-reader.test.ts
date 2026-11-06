import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readSourceFileSafe } from './file-reader'

describe('readSourceFileSafe', () => {
  let root: string
  let outsideDir: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ryte-fr-root-'))
    outsideDir = mkdtempSync(join(tmpdir(), 'ryte-fr-outside-'))
    writeFileSync(join(root, 'a.md'), '# inside\n')
    writeFileSync(join(outsideDir, 'secret.md'), 'secret content\n')
    mkdirSync(join(root, 'sub'))
    writeFileSync(join(root, 'sub', 'b.md'), '# nested\n')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(outsideDir, { recursive: true, force: true })
  })

  it('rejects a symlink that points outside the notes root', async () => {
    symlinkSync(join(outsideDir, 'secret.md'), join(root, 'link.md'))
    await expect(readSourceFileSafe('link.md', root)).rejects.toThrow(/outside notes root/i)
  })

  it('reads a relative source path under the notes root', async () => {
    const text = await readSourceFileSafe('sub/b.md', root)
    expect(text).toBe('# nested\n')
  })

  it('rejects a relative source path that resolves outside the notes root', async () => {
    await expect(readSourceFileSafe('../secret.md', root)).rejects.toThrow(/outside notes root/i)
  })
})
