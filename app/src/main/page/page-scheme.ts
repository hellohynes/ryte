import { randomBytes } from 'node:crypto'
import { realpath } from 'node:fs/promises'

import {
  MAX_PAGE_TEXT_BYTES,
  pageMediaType,
  pageTextType,
  parsePageUrl,
  isPageExtension,
  PAGE_SCHEME
} from '../../shared/page-box'
import {
  locateNoteFile,
  readLocatedNoteFile,
  respondWithLocatedRange,
  type NoteFileRequest
} from '../viewer/note-files'

/** Which folder each open page may read from. The id is random and new every time a page opens. */
export interface PageFolders {
  /** Registers a folder (by its real path) and returns the id its address uses. */
  open(folder: string): string
  folderFor(id: string): string | undefined
  close(id: string): void
}

export function createPageFolders(
  newId: () => string = () => randomBytes(16).toString('hex')
): PageFolders {
  const folders = new Map<string, string>()
  return {
    open(folder) {
      const id = newId()
      folders.set(id, folder)
      return id
    },
    folderFor: (id) => folders.get(id),
    close: (id) => void folders.delete(id)
  }
}

/** The content policy a page is served with: everything from its own origin, nothing from anywhere else. */
export function pageContentPolicy(id: string): string {
  const origin = `${PAGE_SCHEME}://${id}`
  return [
    `default-src ${origin}`,
    `script-src ${origin} 'unsafe-inline'`,
    `style-src ${origin} 'unsafe-inline'`,
    `img-src ${origin} data: blob:`,
    `media-src ${origin} blob:`,
    `font-src ${origin} data:`,
    "connect-src 'none'",
    `frame-src ${origin}`,
    "worker-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'"
  ].join('; ')
}

function headersFor(id: string): Record<string, string> {
  return {
    'Content-Security-Policy': pageContentPolicy(id),
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store'
  }
}

/** Every refusal is the same bare 404, so a page learns nothing about what exists outside its folder. */
const notFound = (): Response => new Response(null, { status: 404 })

/**
 * Answers `ryte-page://<id>/<path>` from the folder registered for that id. The path is decoded once, the file
 * is found by real path inside the folder (a link out is refused), it must be a regular file of a known type,
 * and the file that was checked is the file that is read. Text is read whole up to a cap; pictures, fonts and
 * video are streamed with byte ranges.
 */
export function createPageFolderHandler(
  folders: Pick<PageFolders, 'folderFor'>
): (request: NoteFileRequest) => Promise<Response> {
  return async (request) => {
    const method = request.method.toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') return notFound()

    const parsed = parsePageUrl(request.url)
    if (!parsed) return notFound()
    const folder = folders.folderFor(parsed.id)
    if (folder === undefined) return notFound()

    const located = await locateNoteFile(parsed.path, folder, isPageExtension)
    if (!located.ok) return notFound()

    const headers = headersFor(parsed.id)
    const mediaType = pageMediaType(located.extension)
    if (mediaType !== undefined) {
      return respondWithLocatedRange(located, {
        method,
        range: request.headers?.get('range'),
        contentType: mediaType,
        headers
      })
    }

    const textType = pageTextType(located.extension)!
    if (located.size > MAX_PAGE_TEXT_BYTES) return notFound()
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

/** The real path of a folder, or null when it is gone. */
export const realFolder = (folder: string): Promise<string | null> =>
  realpath(folder).catch(() => null)
