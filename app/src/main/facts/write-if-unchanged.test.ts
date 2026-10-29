import {
  chmodSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { writeFileIfUnchanged } from './write-if-unchanged'

describe('writeFileIfUnchanged', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ryte-write-'))
    file = join(dir, 'note.md')
    writeFileSync(file, 'old\n')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('writes the new content into the same file, so links and permissions are untouched', async () => {
    chmodSync(file, 0o640)
    const link = join(dir, 'link.md')
    linkSync(file, link)
    const before = statSync(file)

    await expect(writeFileIfUnchanged(file, before.mtimeMs, 'new\n')).resolves.toBe(true)

    expect(readFileSync(file, 'utf-8')).toBe('new\n')
    expect(readFileSync(link, 'utf-8')).toBe('new\n')
    expect(statSync(file).ino).toBe(before.ino)
    expect(statSync(file).mode & 0o777).toBe(0o640)
  })

  it('does nothing when the file changed after it was read', async () => {
    const { mtimeMs } = statSync(file)
    const edited = new Date(mtimeMs + 5_000)
    writeFileSync(file, 'edited elsewhere\n')
    utimesSync(file, edited, edited)

    await expect(writeFileIfUnchanged(file, mtimeMs, 'new\n')).resolves.toBe(false)

    expect(readFileSync(file, 'utf-8')).toBe('edited elsewhere\n')
  })

  it('still refuses a read-only note, as a plain write would', async () => {
    chmodSync(file, 0o444)
    const { mtimeMs } = statSync(file)

    await expect(writeFileIfUnchanged(file, mtimeMs, 'new\n')).rejects.toMatchObject({
      code: 'EACCES'
    })
    expect(readFileSync(file, 'utf-8')).toBe('old\n')
  })

  it('reports a file that is gone as a missing-file error', async () => {
    const { mtimeMs } = statSync(file)
    rmSync(file)

    await expect(writeFileIfUnchanged(file, mtimeMs, 'new\n')).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })
})
