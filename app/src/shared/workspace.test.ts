import { describe, expect, it } from 'vitest'

import {
  DOCUMENT_OUTLINE_DEFAULT_WIDTH,
  DOCUMENT_OUTLINE_MAX_WIDTH,
  DOCUMENT_OUTLINE_MIN_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampDocumentOutlineWidth,
  clampSidebarWidth,
  shouldAutoCollapseSidebar,
  workspaceFileDisplayPath,
  workspaceFileKey,
  workspaceFileTitle
} from './workspace'

describe('workspace shell policy', () => {
  it('keeps a 360px default sidebar within normal desktop bounds', () => {
    expect(clampSidebarWidth(SIDEBAR_DEFAULT_WIDTH, 1460)).toBe(SIDEBAR_DEFAULT_WIDTH)
  })

  it('clamps sidebar width to the drag minimum', () => {
    expect(clampSidebarWidth(12, 1460)).toBe(SIDEBAR_MIN_WIDTH)
  })

  it('caps sidebar width at half the viewport', () => {
    expect(clampSidebarWidth(900, 1280)).toBe(640)
  })

  it('clamps document outline width to stable resize bounds', () => {
    expect(clampDocumentOutlineWidth(Number.NaN)).toBe(DOCUMENT_OUTLINE_DEFAULT_WIDTH)
    expect(clampDocumentOutlineWidth(12)).toBe(DOCUMENT_OUTLINE_MIN_WIDTH)
    expect(clampDocumentOutlineWidth(999)).toBe(DOCUMENT_OUTLINE_MAX_WIDTH)
  })

  it('auto-collapses below the small viewport threshold', () => {
    expect(shouldAutoCollapseSidebar(639)).toBe(true)
    expect(shouldAutoCollapseSidebar(640)).toBe(false)
  })

  it('derives stable display metadata for source and external file refs', () => {
    expect(workspaceFileKey({ sourcePath: 'folder/a.md' })).toBe('source:folder/a.md')
    expect(workspaceFileKey({ externalPath: '/tmp/outside.md' })).toBe('external:/tmp/outside.md')
    expect(workspaceFileDisplayPath({ sourcePath: 'folder/a.md' })).toBe('folder/a.md')
    expect(workspaceFileDisplayPath({ externalPath: '/tmp/outside.md' })).toBe('/tmp/outside.md')
    expect(workspaceFileTitle({ externalPath: '/tmp/outside.md' })).toBe('outside.md')
  })
})
