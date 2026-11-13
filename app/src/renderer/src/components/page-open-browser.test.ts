import { describe, expect, it } from 'vitest'

import type { WorkspaceTab } from '../../../shared/workspace'
import { browserTargetOf } from './page-open-browser'

const fileTab = (file: { sourcePath: string } | { externalPath: string }): WorkspaceTab =>
  ({ id: 't', title: 't', viewMode: 'preview', ...file }) as WorkspaceTab

describe('browserTargetOf', () => {
  it('opens an HTML page from the notes folder by its path', () => {
    expect(browserTargetOf(fileTab({ sourcePath: 'review/index.html' }))).toEqual({
      path: 'review/index.html'
    })
  })

  it('opens a local address by its address', () => {
    const tab = { id: 'a', title: 'localhost:3000', url: 'http://localhost:3000/' } as WorkspaceTab
    expect(browserTargetOf(tab)).toEqual({ url: 'http://localhost:3000/' })
  })

  it('offers nothing for a note, a picture, a file outside the notes folder, or no tab', () => {
    expect(browserTargetOf(fileTab({ sourcePath: 'a/plan.md' }))).toBeNull()
    expect(browserTargetOf(fileTab({ sourcePath: 'a/photo.png' }))).toBeNull()
    expect(browserTargetOf(fileTab({ externalPath: '/tmp/page.html' }))).toBeNull()
    expect(browserTargetOf(undefined)).toBeNull()
  })
})
