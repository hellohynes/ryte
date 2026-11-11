import { shell, type BrowserWindow } from 'electron'

const SAFE_EXTERNAL_PROTOCOLS = new Set(['https:', 'mailto:'])

export function isSafeExternalUrl(
  url: string,
  protocols: ReadonlySet<string> = SAFE_EXTERNAL_PROTOCOLS
): boolean {
  try {
    const parsed = new URL(url)
    return protocols.has(parsed.protocol)
  } catch {
    return false
  }
}

/** Opens an address in the default browser or mail app after the same check every external link gets. */
export function openExternalIfSafe(
  url: string,
  protocols: ReadonlySet<string> = SAFE_EXTERNAL_PROTOCOLS
): boolean {
  if (!isSafeExternalUrl(url, protocols)) return false
  void shell.openExternal(url)
  return true
}

export function originForUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.origin === 'null' ? null : parsed.origin
  } catch {
    return null
  }
}

export function isAllowedAppNavigation(url: string, allowedOrigins: ReadonlySet<string>): boolean {
  const origin = originForUrl(url)
  return origin !== null && allowedOrigins.has(origin)
}

export function installNavigationGuards(
  window: BrowserWindow,
  allowedAppOrigins: ReadonlySet<string>
): void {
  window.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) {
      void shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (isAllowedAppNavigation(url, allowedAppOrigins)) return
    event.preventDefault()
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url)
    }
  })
}
