import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { join, sep } from 'node:path'

import {
  MAX_NOTE_PICTURE_BYTES,
  NOTE_PICTURE_CONTENT_TYPES,
  notePictureExtension,
  parseNoteFileUrl
} from '../../shared/note-pictures'

export type NotePictureProblem = 'blocked' | 'missing' | 'too-large'

export type NotePictureCheck =
  | { ok: true; realPath: string; size: number; contentType: string; dev: number; ino: number }
  | { ok: false; reason: NotePictureProblem; size?: number }

const MISSING_CODES = new Set(['ENOENT', 'ENOTDIR'])

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined
}

function isInside(root: string, target: string): boolean {
  return target.startsWith(root + sep)
}

export type LocatedNoteFile =
  | { ok: true; realPath: string; extension: string; size: number; dev: number; ino: number }
  | { ok: false; reason: 'blocked' | 'missing' }

/**
 * Finds a notes-relative file of an allowed type: the type is allowed before and after following links, the
 * file is inside the notes folder after following links, and it is a regular file. The size is not checked here.
 */
export async function locateNoteFile(
  notesRelativePath: string,
  notesRoot: string,
  isAllowedExtension: (extension: string) => boolean
): Promise<LocatedNoteFile> {
  if (!isAllowedExtension(notePictureExtension(notesRelativePath))) {
    return { ok: false, reason: 'blocked' }
  }

  let root: string
  let target: string
  try {
    root = await realpath(notesRoot)
    target = await realpath(join(root, notesRelativePath))
  } catch (error) {
    return { ok: false, reason: MISSING_CODES.has(errorCode(error) ?? '') ? 'missing' : 'blocked' }
  }

  const extension = notePictureExtension(target.split(sep).join('/'))
  if (!isInside(root, target) || !isAllowedExtension(extension)) {
    return { ok: false, reason: 'blocked' }
  }

  const stats = await lstat(target).catch(() => null)
  if (!stats) return { ok: false, reason: 'missing' }
  if (!stats.isFile()) return { ok: false, reason: 'blocked' }
  return { ok: true, realPath: target, extension, size: stats.size, dev: stats.dev, ino: stats.ino }
}

const isPictureExtension = (extension: string): boolean =>
  Object.hasOwn(NOTE_PICTURE_CONTENT_TYPES, extension)

/** `locateNoteFile` for the allowed picture types. */
export function locateNotePicture(
  notesRelativePath: string,
  notesRoot: string
): Promise<LocatedNoteFile> {
  return locateNoteFile(notesRelativePath, notesRoot, isPictureExtension)
}

/** `locateNotePicture`, plus the size cap for showing it inline. */
export async function checkNotePicture(
  notesRelativePath: string,
  notesRoot: string
): Promise<NotePictureCheck> {
  const located = await locateNotePicture(notesRelativePath, notesRoot)
  if (!located.ok) return located
  if (located.size > MAX_NOTE_PICTURE_BYTES) {
    return { ok: false, reason: 'too-large', size: located.size }
  }
  return {
    ok: true,
    realPath: located.realPath,
    size: located.size,
    contentType: NOTE_PICTURE_CONTENT_TYPES[located.extension]!,
    dev: located.dev,
    ino: located.ino
  }
}

/**
 * Reads the file that was located, refusing it if a link or another file has taken its place since, or if it
 * has grown past `maxBytes`. Null means refused or gone.
 */
export async function readLocatedNoteFile(
  located: { realPath: string; dev: number; ino: number },
  maxBytes: number
): Promise<Buffer | null> {
  const handle = await open(located.realPath, constants.O_RDONLY | constants.O_NOFOLLOW).catch(
    () => null
  )
  if (!handle) return null
  try {
    const stats = await handle.stat()
    if (
      !stats.isFile() ||
      stats.dev !== located.dev ||
      stats.ino !== located.ino ||
      stats.size > maxBytes
    ) {
      return null
    }
    return await handle.readFile()
  } finally {
    await handle.close()
  }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'Cache-Control': 'no-cache'
} as const

const PROBLEM_STATUS: Record<NotePictureProblem, number> = {
  blocked: 403,
  missing: 404,
  'too-large': 413
}

function emptyResponse(status: number, extra: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { ...SECURITY_HEADERS, ...extra } })
}

export interface NoteFileRequest {
  method: string
  url: string
}

/** Answers one `ryte-file://notes/...` request. The notes folder is passed in fresh for every request. */
export async function respondToNoteFileRequest(
  request: NoteFileRequest,
  notesRoot: string
): Promise<Response> {
  const method = request.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return emptyResponse(405, { Allow: 'GET, HEAD' })

  const notesRelativePath = parseNoteFileUrl(request.url)
  if (notesRelativePath === null) return emptyResponse(400)

  const check = await checkNotePicture(notesRelativePath, notesRoot)
  if (!check.ok) return emptyResponse(PROBLEM_STATUS[check.reason])

  const headers = {
    ...SECURITY_HEADERS,
    'Content-Type': check.contentType,
    'Content-Length': String(check.size)
  }
  if (method === 'HEAD') return new Response(null, { status: 200, headers })

  const body = await readLocatedNoteFile(check, MAX_NOTE_PICTURE_BYTES)
  if (!body) return emptyResponse(404)
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: { ...headers, 'Content-Length': String(body.byteLength) }
  })
}

export function createNoteFileHandler(
  getNotesRoot: () => string
): (request: NoteFileRequest) => Promise<Response> {
  return (request) => respondToNoteFileRequest(request, getNotesRoot())
}
