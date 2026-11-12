import { describe, expect, it } from 'vitest'

import { isPagePermissionAllowed } from './page-permissions'

describe('isPagePermissionAllowed', () => {
  it('allows a clipboard write only right after a real click or key press', () => {
    expect(isPagePermissionAllowed('clipboard-sanitized-write', true)).toBe(true)
    expect(isPagePermissionAllowed('clipboard-write', true)).toBe(true)
    expect(isPagePermissionAllowed('clipboard-sanitized-write', false)).toBe(false)
    expect(isPagePermissionAllowed('clipboard-write', false)).toBe(false)
  })

  it('never allows reading the clipboard or any other permission, even after a click', () => {
    for (const permission of [
      'clipboard-read',
      'media',
      'geolocation',
      'notifications',
      'fullscreen'
    ]) {
      expect(isPagePermissionAllowed(permission, true)).toBe(false)
    }
  })
})
