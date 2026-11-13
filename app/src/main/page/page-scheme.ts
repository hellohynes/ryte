import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'

import {
  hasSkippedSegment,
  MAX_PAGE_TEXT_BYTES,
  pageMediaType,
  pageTextType,
  pageUrl,
  parsePageUrl
} from '../../shared/page-box'
import {
  locateNoteFile,
  readLocatedNoteFile,
  respondWithLocatedRange,
  type NoteFileRequest
} from '../viewer/note-files'

/** The random salt of this install, made on first use and kept in `file`, so tokens are stable across restarts. */
export function readOrCreateSalt(file: string): string {
  try {
    const saved = readFileSync(file, 'utf8').trim()
    if (saved) return saved
  } catch {
    // Not made yet.
  }
  const salt = randomBytes(16).toString('hex')
  writeFileSync(file, salt)
  return salt
}

/**
 * The token in a page's address: a short salted hash of the page's folder (by real path), so what a page saves
 * stays with its folder and is found again after a restart. The salt keeps the folder's path from being guessed
 * out of the token, which a web server sees in `Origin`.
 */
export const folderToken = (realFolder: string, salt: string): string =>
  createHash('sha256').update(`${salt}\0${realFolder}`).digest('hex').slice(0, 32)

/** The address of a page that is inside the notes folder, by its real path. */
export async function pageAddress(
  notesRoot: string,
  realFile: string,
  salt: string
): Promise<string> {
  const root = await realpath(notesRoot)
  return pageUrl(
    folderToken(dirname(realFile), salt),
    relative(root, realFile).split(sep).join('/')
  )
}

/** The token that belongs to the folder of a notes-relative file, or null when the folder is gone. */
export function tokenOfNotesFolder(
  notesRoot: string,
  notesRelativeFile: string,
  salt: string
): string | null {
  try {
    const folder = realpathSync(join(realpathSync(notesRoot), dirname(notesRelativeFile)))
    return folderToken(folder, salt)
  } catch {
    return null
  }
}

const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store'
}

/** Types a browser runs as a page, with scripts and its own storage: served only under the token of their folder. */
const PAGE_EXTENSIONS: ReadonlySet<string> = new Set(['html', 'htm', 'xhtml'])
/**
 * Types that are pictures or data to a page but a script-capable page when opened on their own. Under another
 * folder's token they are served sandboxed, so a picture or a fetch still works and nothing runs as that origin.
 * (A request does not say what it is for, so a refusal here would also break `<img src="../shared/logo.svg">`.)
 */
const SCRIPTED_DATA_EXTENSIONS: ReadonlySet<string> = new Set(['svg', 'xml'])

/** Every refusal is the same bare 404, so a page learns nothing about what exists outside the notes folder. */
const notFound = (): Response => new Response(null, { status: 404 })

/**
 * Answers `ryte-page://<token>/<path>` from the notes folder. The path is decoded once, the file is found by real
 * path inside the notes folder (a link out is refused, and so is a link into a hidden or dependency folder) and
 * must be a regular file, and the file that was checked is the file that is read. Any file is served whatever the
 * token, except the types a browser runs as a page (by the file's real type): HTML and XHTML are served only
 * under the token of their own folder, and SVG and XML under another token are served sandboxed, so none can run
 * as another folder's origin. Text of a known type is read whole up to a cap; everything else is streamed with byte
 * ranges.
 */
export function createPageHandler(
  getNotesRoot: () => string,
  getSalt: () => string
): (request: NoteFileRequest) => Promise<Response> {
  return async (request) => {
    const method = request.method.toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') return notFound()

    const parsed = parsePageUrl(request.url)
    if (!parsed) return notFound()
    const notesRoot = getNotesRoot()
    const located = await locateNoteFile(parsed.path, notesRoot, () => true)
    if (!located.ok) return notFound()
    const root = await realpath(notesRoot).catch(() => null)
    if (root === null || hasSkippedSegment(relative(root, located.realPath).split(sep))) {
      return notFound()
    }
    const mustOwnToken = PAGE_EXTENSIONS.has(located.extension)
    const sandboxed = SCRIPTED_DATA_EXTENSIONS.has(located.extension)
    const ownToken =
      (!mustOwnToken && !sandboxed) ||
      parsed.token === tokenOfNotesFolder(notesRoot, parsed.path, getSalt())
    if (mustOwnToken && !ownToken) return notFound()
    const headers =
      sandboxed && !ownToken ? { ...HEADERS, 'Content-Security-Policy': 'sandbox' } : HEADERS

    const textType = pageTextType(located.extension)
    if (textType === undefined || located.size > MAX_PAGE_TEXT_BYTES) {
      return respondWithLocatedRange(located, {
        method,
        range: request.headers?.get('range'),
        contentType: textType ?? pageMediaType(located.extension) ?? 'application/octet-stream',
        headers
      })
    }

    const responseHeaders = { ...headers, 'Content-Type': textType }
    if (method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: { ...responseHeaders, 'Content-Length': String(located.size) }
      })
    }
    const body = await readLocatedNoteFile(located, MAX_PAGE_TEXT_BYTES)
    if (!body) return notFound()
    return new Response(new Uint8Array(body.buffer, body.byteOffset, body.byteLength), {
      status: 200,
      headers: { ...responseHeaders, 'Content-Length': String(body.byteLength) }
    })
  }
}
