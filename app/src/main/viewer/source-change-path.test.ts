import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { assertValidSourceFileInput } from '../ipc-validation'
import { sourcePathForViewerChange } from './source-change-path'

describe('sourcePathForViewerChange', () => {
  let root: string
  let linkParent: string
  let linkRoot: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ryte-vsp-root-'))
    linkParent = mkdtempSync(join(tmpdir(), 'ryte-vsp-link-'))
    linkRoot = join(linkParent, 'notes')
    mkdirSync(join(root, 'sub'))
    writeFileSync(join(root, 'sub', 'b.md'), '# nested\n')
    symlinkSync(root, linkRoot, 'dir')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(linkParent, { recursive: true, force: true })
  })

  it('preserves the watched source path when the notes root is a symlink', () => {
    const changedPath = join(root, 'sub', 'b.md')

    expect(() =>
      assertValidSourceFileInput({ sourcePath: relative(linkRoot, changedPath) })
    ).toThrow('Invalid workspace source path')

    expect(sourcePathForViewerChange(changedPath, linkRoot, 'sub/b.md')).toBe('sub/b.md')
  })

  it('derives a source path for legacy absolute watchers under a normal root', () => {
    expect(sourcePathForViewerChange(join(root, 'sub', 'b.md'), root, null)).toBe('sub/b.md')
  })

  it('drops legacy absolute watcher changes that cannot be represented as source paths', () => {
    expect(sourcePathForViewerChange(join(root, '..', 'outside.md'), root, null)).toBeNull()
  })
})
