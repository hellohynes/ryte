import { describe, expect, it } from 'vitest'

import { isAllowedAppNavigation, isSafeExternalUrl, originForUrl } from './navigation'

describe('navigation policy', () => {
  it('allows only safe external protocols', () => {
    expect(isSafeExternalUrl('https://example.com/path')).toBe(true)
    expect(isSafeExternalUrl('mailto:hello@example.com')).toBe(true)
    expect(isSafeExternalUrl('http://example.com')).toBe(false)
    expect(isSafeExternalUrl('file:///Users/test/notes/a.md')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('data:text/html,hello')).toBe(false)
    expect(isSafeExternalUrl('not a url')).toBe(false)
  })

  it('extracts origins only for parseable URLs with origins', () => {
    expect(originForUrl('https://example.com/a')).toBe('https://example.com')
    expect(originForUrl('http://localhost:5173/app')).toBe('http://localhost:5173')
    expect(originForUrl('mailto:hello@example.com')).toBeNull()
    expect(originForUrl('not a url')).toBeNull()
  })

  it('allows navigation only to configured app origins', () => {
    const allowed = new Set(['http://localhost:5173'])
    expect(isAllowedAppNavigation('http://localhost:5173/route', allowed)).toBe(true)
    expect(isAllowedAppNavigation('https://example.com', allowed)).toBe(false)
    expect(isAllowedAppNavigation('file:///Users/test/notes/a.md', allowed)).toBe(false)
    expect(isAllowedAppNavigation('not a url', allowed)).toBe(false)
  })
})
