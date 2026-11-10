import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { walkLibrary, walkNotes } from './walker'

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

  it('matches the .md extension in any letter case', async () => {
    writeFileSync(join(tempDir, 'a.md'), '')
    writeFileSync(join(tempDir, 'IDEAS.MD'), '')
    writeFileSync(join(tempDir, 'Mixed.Md'), '')

    const result = await walkNotes(tempDir)
    expect(result).toEqual([
      join(tempDir, 'IDEAS.MD'),
      join(tempDir, 'Mixed.Md'),
      join(tempDir, 'a.md')
    ])
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

describe('walkLibrary', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ryte-library-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('lists notes, pictures and code files, in any letter case, and hides everything else', async () => {
    writeFileSync(join(tempDir, 'a.md'), '')
    writeFileSync(join(tempDir, 'b.PNG'), '')
    writeFileSync(join(tempDir, 'c.svg'), '')
    writeFileSync(join(tempDir, 'd.JSON'), '')
    writeFileSync(join(tempDir, 'e.mp4'), '')
    writeFileSync(join(tempDir, 'f.txt'), '')
    writeFileSync(join(tempDir, 'g.html'), '')

    expect(await walkLibrary(tempDir)).toEqual([
      join(tempDir, 'a.md'),
      join(tempDir, 'b.PNG'),
      join(tempDir, 'c.svg'),
      join(tempDir, 'd.JSON')
    ])
  })

  it('skips node_modules and dot folders for pictures and code but still lists their notes', async () => {
    for (const folder of ['node_modules', '.hidden', join('docs', 'node_modules')]) {
      mkdirSync(join(tempDir, folder), { recursive: true })
      writeFileSync(join(tempDir, folder, 'inside.md'), '')
      writeFileSync(join(tempDir, folder, 'inside.png'), '')
      writeFileSync(join(tempDir, folder, 'inside.ts'), '')
    }
    mkdirSync(join(tempDir, 'docs'), { recursive: true })
    writeFileSync(join(tempDir, 'docs', 'shown.png'), '')
    writeFileSync(join(tempDir, 'docs', 'shown.ts'), '')

    expect(await walkLibrary(tempDir)).toEqual([
      join(tempDir, '.hidden', 'inside.md'),
      join(tempDir, 'docs', 'node_modules', 'inside.md'),
      join(tempDir, 'docs', 'shown.png'),
      join(tempDir, 'docs', 'shown.ts'),
      join(tempDir, 'node_modules', 'inside.md')
    ])
  })
})
