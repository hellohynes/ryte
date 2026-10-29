import { shell, type BrowserWindow } from 'electron'

const SAFE_EXTERNAL_PROTOCOLS = new Set(['https:', 'mailto:'])

export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol)
  } catch {
    return false
  }
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
