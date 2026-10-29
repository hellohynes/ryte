import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readFileSafe, readSourceFileSafe } from './file-reader'

describe('readFileSafe', () => {
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

  it('reads a file under the notes root', async () => {
    const text = await readFileSafe(join(root, 'a.md'), root)
    expect(text).toBe('# inside\n')
  })

  it('reads a file in a nested folder under the notes root', async () => {
    const text = await readFileSafe(join(root, 'sub', 'b.md'), root)
    expect(text).toBe('# nested\n')
  })

  it('rejects a path escaping the root via ".."', async () => {
    const escape = join(root, '..', 'unrelated.md')
    await expect(readFileSafe(escape, root)).rejects.toThrow(/outside notes root/i)
  })

  it('rejects an absolute path outside the notes root', async () => {
    await expect(readFileSafe(join(outsideDir, 'secret.md'), root)).rejects.toThrow(
      /outside notes root/i
    )
  })

  it('rejects a symlink that points outside the notes root', async () => {
    const linkPath = join(root, 'link.md')
    symlinkSync(join(outsideDir, 'secret.md'), linkPath)
    await expect(readFileSafe(linkPath, root)).rejects.toThrow(/outside notes root/i)
  })

  it('reads a relative source path under the notes root', async () => {
    const text = await readSourceFileSafe('sub/b.md', root)
    expect(text).toBe('# nested\n')
  })

  it('rejects a relative source path that resolves outside the notes root', async () => {
    await expect(readSourceFileSafe('../secret.md', root)).rejects.toThrow(/outside notes root/i)
  })
})
