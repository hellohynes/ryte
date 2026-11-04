import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { fileRefForPickedMarkdownFile } from './picked-file'

let base: string
let root: string
let outside: string

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'ryte-picked-')))
  root = join(base, 'notes')
  outside = join(base, 'elsewhere')
  await mkdir(join(root, 'folder'), { recursive: true })
  await mkdir(outside)
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

describe('fileRefForPickedMarkdownFile', () => {
  it('returns a notes-relative sourcePath for a file inside the notes root', async () => {
    await writeFile(join(root, 'folder', 'a.md'), '# a')

    await expect(fileRefForPickedMarkdownFile(join(root, 'folder', 'a.md'), root)).resolves.toEqual(
      { sourcePath: 'folder/a.md' }
    )
  })

  it('returns an externalPath for a file outside the notes root', async () => {
    const file = join(outside, 'b.md')
    await writeFile(file, '# b')

    await expect(fileRefForPickedMarkdownFile(file, root)).resolves.toEqual({ externalPath: file })
  })

  it('does not treat a sibling folder that shares the root name as inside the root', async () => {
    const sibling = join(base, 'notes-extra')
    await mkdir(sibling)
    await writeFile(join(sibling, 'c.md'), '# c')

    await expect(fileRefForPickedMarkdownFile(join(sibling, 'c.md'), root)).resolves.toEqual({
      externalPath: join(sibling, 'c.md')
    })
  })

  it('refuses a file that is not Markdown', async () => {
    await writeFile(join(root, 'notes.txt'), 'text')

    await expect(fileRefForPickedMarkdownFile(join(root, 'notes.txt'), root)).rejects.toThrow(
      'Selected file must be a Markdown file'
    )
  })

  it('refuses a Markdown-named path that is not a regular file', async () => {
    await mkdir(join(root, 'folder.md'))

    await expect(fileRefForPickedMarkdownFile(join(root, 'folder.md'), root)).rejects.toThrow(
      'Workspace file not found'
    )
  })

  it('resolves a symlink with realpath: a link inside the root to a file outside is external', async () => {
    const target = join(outside, 'secret.md')
    await writeFile(target, '# secret')
    await symlink(target, join(root, 'link.md'))

    await expect(fileRefForPickedMarkdownFile(join(root, 'link.md'), root)).resolves.toEqual({
      externalPath: target
    })
  })

  it('resolves a link outside the root to a file inside it as a sourcePath', async () => {
    await writeFile(join(root, 'real.md'), '# real')
    await symlink(join(root, 'real.md'), join(outside, 'alias.md'))

    await expect(fileRefForPickedMarkdownFile(join(outside, 'alias.md'), root)).resolves.toEqual({
      sourcePath: 'real.md'
    })
  })

  it('accepts a notes root given as a symlink to the real folder', async () => {
    const rootLink = join(base, 'notes-link')
    await symlink(root, rootLink)
    await writeFile(join(root, 'a.md'), '# a')

    await expect(fileRefForPickedMarkdownFile(join(root, 'a.md'), rootLink)).resolves.toEqual({
      sourcePath: 'a.md'
    })
  })
})
