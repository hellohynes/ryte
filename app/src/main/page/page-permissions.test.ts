import { describe, expect, it } from 'vitest'

import { isPagePermissionAllowed } from './page-permissions'

describe('isPagePermissionAllowed', () => {
  it('allows reading and writing the clipboard', () => {
    for (const permission of ['clipboard-read', 'clipboard-sanitized-write', 'clipboard-write']) {
      expect(isPagePermissionAllowed(permission), permission).toBe(true)
    }
  })

  it('refuses the camera, microphone, location and notifications', () => {
    for (const permission of ['media', 'geolocation', 'notifications', 'midi', 'fullscreen']) {
      expect(isPagePermissionAllowed(permission), permission).toBe(false)
    }
  })
})
