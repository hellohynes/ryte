/** The permissions a page may use to write to the clipboard. Chromium asks for the first on `writeText`. */
const CLIPBOARD_WRITE_PERMISSIONS: ReadonlySet<string> = new Set([
  'clipboard-sanitized-write',
  'clipboard-write'
])

/**
 * Whether a locked page may have this permission. Decision pages copy their answers on a click, so a clipboard
 * write is allowed, and only right after a real click or key press in the page. Reading the clipboard, and every
 * other permission, is never allowed.
 */
export function isPagePermissionAllowed(permission: string, recentRealInput: boolean): boolean {
  return recentRealInput && CLIPBOARD_WRITE_PERMISSIONS.has(permission)
}
