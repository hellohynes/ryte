import { mkdirSync, mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MAX_NOTE_PICTURE_BYTES } from '../../shared/note-pictures'
import { createNoteFileHandler, respondToNoteFileRequest } from './note-files'

const PNG_BYTES = Buffer.from('89504e470d0a1a0a', 'hex')

describe('respondToNoteFileRequest', () => {
  let root: string
  let outside: string

  const get = (url: string, notesRoot = root): Promise<Response> =>
    respondToNoteFileRequest({ method: 'GET', url }, notesRoot)

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ryte-nf-root-'))
    outside = mkdtempSync(join(tmpdir(), 'ryte-nf-outside-'))
    mkdirSync(join(root, 'images', 'déjà vu'), { recursive: true })
    writeFileSync(join(root, 'images', 'déjà vu', 'shot one.png'), PNG_BYTES)
    writeFileSync(join(outside, 'secret.png'), PNG_BYTES)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  it('serves a picture inside the notes folder with headers that keep it a picture', async () => {
    const response = await get('ryte-file://notes/images/d%C3%A9j%C3%A0%20vu/shot%20one.png')

    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG_BYTES)
    expect(Object.fromEntries(response.headers)).toEqual({
      'cache-control': 'no-cache',
      'content-length': String(PNG_BYTES.byteLength),
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'content-type': 'image/png',
      'x-content-type-options': 'nosniff'
    })
  })

  it('answers HEAD with headers and no body', async () => {
    const response = await respondToNoteFileRequest(
      { method: 'HEAD', url: 'ryte-file://notes/images/d%C3%A9j%C3%A0%20vu/shot%20one.png' },
      root
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe(String(PNG_BYTES.byteLength))
    expect(response.body).toBeNull()
  })

  it('refuses methods other than GET and HEAD', async () => {
    const response = await respondToNoteFileRequest(
      { method: 'POST', url: 'ryte-file://notes/images/d%C3%A9j%C3%A0%20vu/shot%20one.png' },
      root
    )
    expect(response.status).toBe(405)
  })

  it.each([
    ['a parent segment', 'ryte-file://notes/images/../../secret.png'],
    ['an encoded parent segment', 'ryte-file://notes/%2e%2E/secret.png'],
    ['a backslash', 'ryte-file://notes/images%5C..%5Csecret.png'],
    ['a NUL byte', 'ryte-file://notes/a.png%00.png'],
    ['an encoded absolute path', 'ryte-file://notes/%2Fetc%2Fa.png'],
    ['a malformed escape', 'ryte-file://notes/%E0%A4%A.png'],
    ['another host', 'ryte-file://elsewhere/a.png']
  ])('refuses %s', async (_name, url) => {
    expect((await get(url)).status).toBe(400)
  })

  it('refuses a link that points outside the notes folder', async () => {
    symlinkSync(join(outside, 'secret.png'), join(root, 'link.png'))
    expect((await get('ryte-file://notes/link.png')).status).toBe(403)
  })

  it('refuses a picture-named link to a file of another type', async () => {
    writeFileSync(join(root, 'note.md'), '# private\n')
    symlinkSync(join(root, 'note.md'), join(root, 'note.png'))
    expect((await get('ryte-file://notes/note.png')).status).toBe(403)
  })

  it('returns not found for a missing picture', async () => {
    expect((await get('ryte-file://notes/images/none.png')).status).toBe(404)
  })

  it('serves only picture types, matching the extension in any case', async () => {
    writeFileSync(join(root, 'UPPER.PNG'), PNG_BYTES)
    writeFileSync(join(root, 'note.md'), '# private\n')
    writeFileSync(join(root, 'data.json'), '{}')
    writeFileSync(join(root, 'photo.heic'), 'x')

    expect((await get('ryte-file://notes/UPPER.PNG')).status).toBe(200)
    expect((await get('ryte-file://notes/note.md')).status).toBe(403)
    expect((await get('ryte-file://notes/data.json')).status).toBe(403)
    expect((await get('ryte-file://notes/photo.heic')).status).toBe(403)
  })

  it('refuses a folder with a picture name', async () => {
    mkdirSync(join(root, 'folder.png'))
    expect((await get('ryte-file://notes/folder.png')).status).toBe(403)
  })

  it('refuses a picture over the size cap', async () => {
    const big = join(root, 'big.png')
    writeFileSync(big, '')
    truncateSync(big, MAX_NOTE_PICTURE_BYTES + 1)
    expect((await get('ryte-file://notes/big.png')).status).toBe(413)
  })

  it('reads the notes folder again for every request', async () => {
    let notesRoot = root
    const handle = createNoteFileHandler(() => notesRoot)
    const url = 'ryte-file://notes/images/d%C3%A9j%C3%A0%20vu/shot%20one.png'

    expect((await handle({ method: 'GET', url })).status).toBe(200)
    notesRoot = outside
    expect((await handle({ method: 'GET', url })).status).toBe(404)
  })
})
