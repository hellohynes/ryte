import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { walkNotes } from './walker'

let tempDir: string

describe('walkNotes', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ryte-walker-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('returns all .md files recursively as absolute, sorted paths', async () => {
    writeFileSync(join(tempDir, 'a.md'), '')
    mkdirSync(join(tempDir, 'sub'))
    writeFileSync(join(tempDir, 'sub', 'b.md'), '')
    mkdirSync(join(tempDir, 'sub', 'deep'))
    writeFileSync(join(tempDir, 'sub', 'deep', 'c.md'), '')

    const result = await walkNotes(tempDir)

    expect(result).toEqual([
      join(tempDir, 'a.md'),
      join(tempDir, 'sub', 'b.md'),
      join(tempDir, 'sub', 'deep', 'c.md')
    ])
  })

  it('ignores non-.md files', async () => {
    writeFileSync(join(tempDir, 'a.md'), '')
    writeFileSync(join(tempDir, 'b.txt'), '')
    writeFileSync(join(tempDir, 'c.json'), '')

    const result = await walkNotes(tempDir)
    expect(result).toEqual([join(tempDir, 'a.md')])
  })

  it('includes dotfile .md files', async () => {
    writeFileSync(join(tempDir, 'a.md'), '')
    mkdirSync(join(tempDir, 'hidden'))
    writeFileSync(join(tempDir, 'hidden', '.dotfile.md'), '')

    const result = await walkNotes(tempDir)
    expect(result).toContain(join(tempDir, 'hidden', '.dotfile.md'))
  })

  it('returns empty array for an empty notes root', async () => {
    expect(await walkNotes(tempDir)).toEqual([])
  })

  it('throws on a non-existent notes root', async () => {
    await expect(walkNotes('/nonexistent/path/xyz')).rejects.toThrow()
  })
})
