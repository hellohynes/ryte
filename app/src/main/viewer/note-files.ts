import { constants } from 'node:fs'
import { type FileHandle, lstat, open, realpath } from 'node:fs/promises'
import { join, sep } from 'node:path'

import {
  MAX_NOTE_PICTURE_BYTES,
  NOTE_PICTURE_CONTENT_TYPES,
  notePictureExtension,
  parseNoteFileUrl
} from '../../shared/note-pictures'
import { isSupportedNoteVideo, noteVideoContentType } from '../../shared/note-videos'
import { parseByteRange } from './byte-range'

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
  | {
      ok: true
      realPath: string
      extension: string
      size: number
      mtimeMs: number
      dev: number
      ino: number
    }
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
  return {
    ok: true,
    realPath: target,
    extension,
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    dev: stats.dev,
    ino: stats.ino
  }
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
 * is over `maxBytes`. It reads no more than the size it checked, so a file that grows meanwhile is cut at that
 * size, and it opens without blocking, so a pipe swapped in since can't hold it up. Null means refused or gone.
 */
export async function readLocatedNoteFile(
  located: { realPath: string; dev: number; ino: number },
  maxBytes: number
): Promise<Buffer<ArrayBuffer> | null> {
  const handle = await open(
    located.realPath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  ).catch(() => null)
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
    const buffer = Buffer.alloc(stats.size)
    const { bytesRead } = await handle.read(buffer, 0, stats.size, 0)
    return buffer.subarray(0, bytesRead)
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

const isVideoExtension = (extension: string): boolean =>
  noteVideoContentType(extension) !== undefined

/** How much of a video is read from disk per pull of the response stream. */
const VIDEO_CHUNK_BYTES = 256 * 1024

/** Opens a located file the way `readLocatedNoteFile` does, refusing a link or another file in its place. */
async function openCheckedNoteFile(located: {
  realPath: string
  dev: number
  ino: number
}): Promise<FileHandle | null> {
  const handle = await open(
    located.realPath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  ).catch(() => null)
  if (!handle) return null
  const stats = await handle.stat().catch(() => null)
  if (!stats || !stats.isFile() || stats.dev !== located.dev || stats.ino !== located.ino) {
    await handle.close().catch(() => undefined)
    return null
  }
  return handle
}

/**
 * The bytes `start` to `end` (inclusive) of a located file, read a piece at a time as the player asks. The
 * file is opened on the first read, checked again, and closed when the range is done, the player stops, or a
 * read fails. Nothing past `end` is ever read, and a file that shrank meanwhile ends the stream with an error.
 */
function streamNoteFileRange(
  located: { realPath: string; dev: number; ino: number },
  start: number,
  end: number
): ReadableStream<Uint8Array> {
  let handle: FileHandle | null = null
  let next = start
  let finished = false

  const finish = async (): Promise<void> => {
    finished = true
    const open = handle
    handle = null
    await open?.close().catch(() => undefined)
  }

  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        if (finished) return
        try {
          if (!handle) {
            const opened = await openCheckedNoteFile(located)
            if (!opened) throw new Error('The video changed or is gone')
            if (finished) {
              await opened.close().catch(() => undefined)
              return
            }
            handle = opened
          }
          const length = Math.min(VIDEO_CHUNK_BYTES, end - next + 1)
          const buffer = Buffer.allocUnsafe(length)
          const { bytesRead } = await handle.read(buffer, 0, length, next)
          if (finished) return
          if (bytesRead === 0) throw new Error('The video ended early')
          next += bytesRead
          controller.enqueue(new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead))
          if (next > end) {
            await finish()
            controller.close()
          }
        } catch (error) {
          await finish()
          controller.error(error)
        }
      },
      cancel: finish
    },
    // Nothing is read until the player asks for it.
    { highWaterMark: 0 }
  )
}

export interface RangedFileOptions {
  method: string
  /** The `Range` request header, if any. */
  range: string | null | undefined
  contentType: string
  /** Headers sent on every answer, success or not (security headers). */
  headers: Record<string, string>
}

/**
 * Answers a request for a located file whole or by byte range, so a player can seek. `HEAD` gets the size and
 * no body. The file is streamed a piece at a time and checked again when opened.
 */
export function respondWithLocatedRange(
  located: { realPath: string; dev: number; ino: number; size: number },
  { method, range: rangeHeader, contentType, headers }: RangedFileOptions
): Response {
  const { size } = located
  const baseHeaders = { ...headers, 'Accept-Ranges': 'bytes', 'Content-Type': contentType }
  if (method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: { ...baseHeaders, 'Content-Length': String(size) }
    })
  }

  const range = parseByteRange(rangeHeader, size)
  if (range.kind === 'malformed' || range.kind === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { ...headers, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes */${size}` }
    })
  }

  if (range.kind === 'whole') {
    const wholeHeaders = { ...baseHeaders, 'Content-Length': String(size) }
    if (size === 0) return new Response(null, { status: 200, headers: wholeHeaders })
    return new Response(streamNoteFileRange(located, 0, size - 1), {
      status: 200,
      headers: wholeHeaders
    })
  }

  return new Response(streamNoteFileRange(located, range.start, range.end), {
    status: 206,
    headers: {
      ...baseHeaders,
      'Content-Length': String(range.end - range.start + 1),
      'Content-Range': `bytes ${range.start}-${range.end}/${size}`
    }
  })
}

/** Answers a request for a video, whole or by byte range, so the player can seek. */
async function respondToVideoRequest(
  request: NoteFileRequest,
  method: string,
  notesRelativePath: string,
  notesRoot: string
): Promise<Response> {
  const located = await locateNoteFile(notesRelativePath, notesRoot, isVideoExtension)
  if (!located.ok) return emptyResponse(PROBLEM_STATUS[located.reason])
  return respondWithLocatedRange(located, {
    method,
    range: request.headers?.get('range'),
    contentType: noteVideoContentType(located.extension)!,
    headers: SECURITY_HEADERS
  })
}

export interface NoteFileRequest {
  method: string
  url: string
  /** The request headers; only `Range` is read, and only for videos. */
  headers?: { get(name: string): string | null }
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

  if (isSupportedNoteVideo(notesRelativePath)) {
    return respondToVideoRequest(request, method, notesRelativePath, notesRoot)
  }

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
  // A view over the buffer already read; `new Uint8Array(body)` would copy the whole picture again.
  return new Response(new Uint8Array(body.buffer, body.byteOffset, body.byteLength), {
    status: 200,
    headers: { ...headers, 'Content-Length': String(body.byteLength) }
  })
}

export function createNoteFileHandler(
  getNotesRoot: () => string
): (request: NoteFileRequest) => Promise<Response> {
  return (request) => respondToNoteFileRequest(request, getNotesRoot())
}
