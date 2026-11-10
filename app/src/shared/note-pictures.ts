/** Pictures and videos in notes load through this scheme, from inside the notes folder only. */
export const NOTE_FILE_SCHEME = 'ryte-file'
export const NOTE_FILE_URL_PREFIX = `${NOTE_FILE_SCHEME}://notes/`

/** Larger pictures are not shown inline; the note offers to open them in the default app instead. */
export const MAX_NOTE_PICTURE_BYTES = 50 * 1024 * 1024

export const NOTE_PICTURE_CONTENT_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml'
}

/**
 * Types the default app may open. SVG is left out: the default app for SVG can be a browser,
 * which would run scripts inside the file.
 */
export const RASTER_NOTE_PICTURE_EXTENSIONS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif'
])

/** The lowercased extension of the last path segment, without the dot, or '' when there is none. */
export function notePictureExtension(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function isSupportedNotePicture(path: string): boolean {
  return Object.hasOwn(NOTE_PICTURE_CONTENT_TYPES, notePictureExtension(path))
}

/**
 * Reads the notes-relative path out of a `ryte-file://notes/...` address. The path is decoded once and
 * refused when it is empty, absolute, has `.`, `..` or empty segments (encoded or not), a backslash or a
 * NUL byte. Returns null when refused.
 */
export function parseNoteFileUrl(url: string): string | null {
  if (url.slice(0, NOTE_FILE_URL_PREFIX.length).toLowerCase() !== NOTE_FILE_URL_PREFIX) return null

  let encoded = url.slice(NOTE_FILE_URL_PREFIX.length)
  const end = encoded.search(/[?#]/)
  if (end >= 0) encoded = encoded.slice(0, end)

  let path: string
  try {
    path = decodeURIComponent(encoded)
  } catch {
    return null
  }

  if (!path || path.includes('\0') || path.includes('\\') || path.startsWith('/')) return null
  if (path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return null
  }
  return path
}

/** Builds the address for a notes-relative path, one encoded segment at a time. */
export function noteFileUrl(notesRelativePath: string): string {
  return NOTE_FILE_URL_PREFIX + notesRelativePath.split('/').map(encodeURIComponent).join('/')
}
