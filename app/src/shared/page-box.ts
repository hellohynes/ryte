import { isSkippedFolder } from './supported-types'

/** HTML pages open in a locked view that loads only from the page's own folder, through this scheme. */
export const PAGE_SCHEME = 'ryte-page'

/** Larger text files (the page, its scripts and styles) are not served. */
export const MAX_PAGE_TEXT_BYTES = 10 * 1024 * 1024

/** Types a page may load from its folder, as text (read whole) and as media (streamed, with ranges). */
const PAGE_TEXT_TYPES: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8'
}

const PAGE_MEDIA_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime'
}

export function pageTextType(extension: string): string | undefined {
  return Object.hasOwn(PAGE_TEXT_TYPES, extension) ? PAGE_TEXT_TYPES[extension] : undefined
}

export function pageMediaType(extension: string): string | undefined {
  return Object.hasOwn(PAGE_MEDIA_TYPES, extension) ? PAGE_MEDIA_TYPES[extension] : undefined
}

export const isPageExtension = (extension: string): boolean =>
  pageTextType(extension) !== undefined || pageMediaType(extension) !== undefined

/** Whether a name is an HTML page by its extension, in any letter case. */
export function isHtmlPagePath(path: string): boolean {
  const lower = path.toLowerCase()
  return lower.endsWith('.html') || lower.endsWith('.htm')
}

/** `ryte-page://<id>/<path>`: the address of a file in a page's folder. */
export function pageUrl(id: string, relativePath: string): string {
  return `${PAGE_SCHEME}://${id}/${relativePath.split('/').map(encodeURIComponent).join('/')}`
}

const PAGE_ID_RE = /^[0-9a-f]{32}$/

export interface ParsedPageUrl {
  id: string
  /** The folder-relative path, decoded once; never absolute, never `.` or `..` or empty segments. */
  path: string
}

/**
 * Reads the id and the folder-relative path out of a `ryte-page://<id>/<path>` address. The path is decoded once
 * and refused when it is empty, has `.`, `..` or empty segments (encoded or not), a backslash or a NUL byte.
 * Returns null when refused.
 */
export function parsePageUrl(url: string): ParsedPageUrl | null {
  const prefix = `${PAGE_SCHEME}://`
  if (url.slice(0, prefix.length).toLowerCase() !== prefix) return null

  let rest = url.slice(prefix.length)
  const end = rest.search(/[?#]/)
  if (end >= 0) rest = rest.slice(0, end)

  const slash = rest.indexOf('/')
  if (slash < 0) return null
  const id = rest.slice(0, slash).toLowerCase()
  if (!PAGE_ID_RE.test(id)) return null

  let path: string
  try {
    path = decodeURIComponent(rest.slice(slash + 1))
  } catch {
    return null
  }
  if (!path || path.includes('\0') || path.includes('\\') || path.startsWith('/')) return null
  const segments = path.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null
  // The same hidden-and-dependency rule as the tree: a page never reads `.obsidian/`, `.env.json` or `node_modules/`.
  if (segments.some(isSkippedFolder)) return null
  return { id, path }
}
