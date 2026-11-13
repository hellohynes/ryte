import { isSkippedFolder } from './supported-types'

/** HTML pages load their own files, and any other file of the notes folder, through this scheme. */
export const PAGE_SCHEME = 'ryte-page'

/** Larger text files (the page, its scripts and styles) are not served. */
export const MAX_PAGE_TEXT_BYTES = 10 * 1024 * 1024

/** Known types a page loads, as text (read whole) and as media (streamed, with ranges). Any other file is streamed as bytes. */
const PAGE_TEXT_TYPES: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  yaml: 'text/plain; charset=utf-8',
  yml: 'text/plain; charset=utf-8'
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
  mov: 'video/quicktime',
  pdf: 'application/pdf'
}

export function pageTextType(extension: string): string | undefined {
  return Object.hasOwn(PAGE_TEXT_TYPES, extension) ? PAGE_TEXT_TYPES[extension] : undefined
}

export function pageMediaType(extension: string): string | undefined {
  return Object.hasOwn(PAGE_MEDIA_TYPES, extension) ? PAGE_MEDIA_TYPES[extension] : undefined
}

/** Whether a name is an HTML page by its extension, in any letter case. */
export function isHtmlPagePath(path: string): boolean {
  const lower = path.toLowerCase()
  return lower.endsWith('.html') || lower.endsWith('.htm')
}

/** `ryte-page://<token>/<path>`: the address of a file of the notes folder; the token names the page's folder. */
export function pageUrl(token: string, relativePath: string): string {
  return `${PAGE_SCHEME}://${token}/${relativePath.split('/').map(encodeURIComponent).join('/')}`
}

const PAGE_TOKEN_RE = /^[0-9a-f]{32}$/

/**
 * The same hidden-and-dependency rule as the tree, in any letter case: a page never reads `.obsidian/`, `.env.json`
 * or `node_modules/`.
 */
export const hasSkippedSegment = (segments: readonly string[]): boolean =>
  segments.some((segment) => isSkippedFolder(segment.toLowerCase()))

export interface ParsedPageUrl {
  token: string
  /** The notes-relative path, decoded once; never absolute, never `.` or `..` or empty segments. */
  path: string
}

/**
 * Reads the token and the notes-relative path out of a `ryte-page://<token>/<path>` address. The path is decoded once
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
  const token = rest.slice(0, slash).toLowerCase()
  if (!PAGE_TOKEN_RE.test(token)) return null

  let path: string
  try {
    path = decodeURIComponent(rest.slice(slash + 1))
  } catch {
    return null
  }
  if (!path || path.includes('\0') || path.includes('\\') || path.startsWith('/')) return null
  const segments = path.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null
  if (hasSkippedSegment(segments)) return null
  return { token, path }
}
