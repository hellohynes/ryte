import { describe, expect, it } from 'vitest'

import { fileExtension, resolveFileIconName } from './file-icon-resolver'

describe('file icon resolver', () => {
  it('returns the generic file icon for unknown extensions', () => {
    expect(resolveFileIconName('notes/briefing.unknown')).toBe('file')
  })

  it('normalizes extensions for future file-type mappings', () => {
    expect(fileExtension('docs/OVERVIEW.MD')).toBe('md')
    expect(fileExtension('.notes-config')).toBe('')
    expect(fileExtension('README')).toBe('')
  })
})
