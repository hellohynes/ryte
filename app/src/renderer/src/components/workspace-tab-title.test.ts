import { describe, expect, it } from 'vitest'

import type { WorkspaceTab } from '../../../shared/workspace'
import { workspaceTabLabel } from './workspace-tab-title'

function tab(sourcePath: string): WorkspaceTab {
  return {
    id: sourcePath,
    sourcePath,
    title: sourcePath.split('/').at(-1)!,
    viewMode: 'preview'
  } as WorkspaceTab
}

describe('workspaceTabLabel', () => {
  const titles: Record<string, string> = {
    'a/plan.md': 'Launch plan',
    'a/untitled.md': 'untitled',
    'a/photo.png': 'photo.png'
  }
  const catalog = (path: string): string | null => titles[path] ?? null

  it('shows a note’s document title', () => {
    expect(workspaceTabLabel(tab('a/plan.md'), catalog)).toBe('Launch plan')
  })

  it('keeps the file name for a note with no title of its own', () => {
    expect(workspaceTabLabel(tab('a/untitled.md'), catalog)).toBe('untitled.md')
  })

  it('keeps the file name while the catalog has no entry', () => {
    expect(workspaceTabLabel(tab('a/new.md'), catalog)).toBe('new.md')
  })

  it('keeps the file name for a tab that is not a note', () => {
    expect(workspaceTabLabel(tab('a/photo.png'), catalog)).toBe('photo.png')
  })
})
