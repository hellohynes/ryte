import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const real = vi.hoisted(() => ({
  readFile: null as unknown as typeof import('node:fs/promises').readFile
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  real.readFile = actual.readFile
  return { ...actual, readFile: vi.fn(actual.readFile) }
})

import { readFile } from 'node:fs/promises'

import { TaskFactsService } from './task-facts-service'

const input = {
  sourcePath: 'tasks.md',
  line: 3,
  checkboxColumn: 2,
  checked: true,
  expectedLine: '- [ ] Follow up'
}

describe('TaskFactsService.toggle write contract', () => {
  let root: string
  let file: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ryte-toggle-'))
    file = join(root, 'tasks.md')
    writeFileSync(file, '# Tasks\n\n- [ ] Follow up\n')
  })
  afterEach(() => {
    vi.mocked(readFile).mockImplementation(real.readFile)
    rmSync(root, { recursive: true, force: true })
  })

  it('refuses, leaving the note alone, when it is saved elsewhere after the toggle read it', async () => {
    vi.mocked(readFile).mockImplementationOnce(((...args: Parameters<typeof real.readFile>) =>
      real.readFile(...args).then((text) => {
        // An editor saves right after the mtime was taken.
        const later = new Date(Date.now() + 10_000)
        utimesSync(file, later, later)
        return text
      })) as typeof real.readFile)

    const result = await new TaskFactsService().toggle(root, input)

    expect(result).toEqual({ ok: false, reason: 'source-line-changed' })
    expect(readFileSync(file, 'utf-8')).toBe('# Tasks\n\n- [ ] Follow up\n')
  })

  it('refuses, leaving the note alone, when it is saved between the toggle taking its mtime and reading it', async () => {
    vi.mocked(readFile).mockImplementationOnce(((...args: Parameters<typeof real.readFile>) => {
      // The editor's save lands first, so the text read is newer than the mtime that was taken.
      writeFileSync(file, '# Tasks\n\n- [ ] Follow up\n')
      const later = new Date(Date.now() + 10_000)
      utimesSync(file, later, later)
      return real.readFile(...args)
    }) as typeof real.readFile)

    const result = await new TaskFactsService().toggle(root, input)

    expect(result).toEqual({ ok: false, reason: 'source-line-changed' })
    expect(readFileSync(file, 'utf-8')).toBe('# Tasks\n\n- [ ] Follow up\n')
  })

  it('toggles a symlinked note through to its target and leaves the link a link', async () => {
    mkdirSync(join(root, 'elsewhere'))
    const target = join(root, 'elsewhere', 'real.md')
    writeFileSync(target, '# Tasks\n\n- [ ] Follow up\n')
    rmSync(file)
    symlinkSync(target, file)

    const result = await new TaskFactsService().toggle(root, input)

    expect(result).toMatchObject({ ok: true })
    expect(readFileSync(target, 'utf-8')).toBe('# Tasks\n\n- [x] Follow up\n')
    expect(lstatSync(file).isSymbolicLink()).toBe(true)
  })

  it('does not change a read-only note', async () => {
    chmodSync(file, 0o444)

    await expect(new TaskFactsService().toggle(root, input)).rejects.toMatchObject({
      code: 'EACCES'
    })
    expect(readFileSync(file, 'utf-8')).toBe('# Tasks\n\n- [ ] Follow up\n')
  })
})
