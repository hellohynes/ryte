import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'

import {
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

/**
 * The token in a page's address: a short hash of the page's folder (by real path), so what a page saves stays
 * with its folder and is found again after a restart. It names the origin only; it never limits what is served.
 */
export const folderToken = (realFolder: string): string =>
  createHash('sha256').update(realFolder).digest('hex').slice(0, 32)

/** The address of a page that is inside the notes folder, by its real path. */
export async function pageAddress(notesRoot: string, realFile: string): Promise<string> {
  const root = await realpath(notesRoot)
  return pageUrl(folderToken(dirname(realFile)), relative(root, realFile).split(sep).join('/'))
}

/** The token that belongs to the folder of a notes-relative file, or null when the folder is gone. */
export function tokenOfNotesFolder(notesRoot: string, notesRelativeFile: string): string | null {
  try {
    return folderToken(realpathSync(join(realpathSync(notesRoot), dirname(notesRelativeFile))))
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

/** Every refusal is the same bare 404, so a page learns nothing about what exists outside the notes folder. */
const notFound = (): Response => new Response(null, { status: 404 })

/**
 * Answers `ryte-page://<token>/<path>` from the notes folder, whatever the token. The path is decoded once, the
 * file is found by real path inside the notes folder (a link out is refused) and must be a regular file, and the
 * file that was checked is the file that is read. Text of a known type is read whole up to a cap; everything else
 * is streamed with byte ranges.
 */
export function createPageHandler(
  getNotesRoot: () => string
): (request: NoteFileRequest) => Promise<Response> {
  return async (request) => {
    const method = request.method.toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') return notFound()

    const parsed = parsePageUrl(request.url)
    if (!parsed) return notFound()
    const located = await locateNoteFile(parsed.path, getNotesRoot(), () => true)
    if (!located.ok) return notFound()

    const textType = pageTextType(located.extension)
    if (textType === undefined) {
      return respondWithLocatedRange(located, {
        method,
        range: request.headers?.get('range'),
        contentType: pageMediaType(located.extension) ?? 'application/octet-stream',
        headers: HEADERS
      })
    }

    if (located.size > MAX_PAGE_TEXT_BYTES) return notFound()
    const responseHeaders = { ...HEADERS, 'Content-Type': textType }
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
