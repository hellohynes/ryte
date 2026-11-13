/** The only permissions a page gets: Chromium asks for these to read and to write the clipboard. */
const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set([
  'clipboard-read',
  'clipboard-sanitized-write',
  'clipboard-write'
])

/**
 * Whether a page may have this permission. The clipboard, at any time. Camera, microphone, location, other
 * devices and notifications are refused, because Ryte has nowhere to ask, and so is everything not listed.
 */
export const isPagePermissionAllowed = (permission: string): boolean =>
  ALLOWED_PERMISSIONS.has(permission)
