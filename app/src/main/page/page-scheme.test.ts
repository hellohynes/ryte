import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createPageHandler, folderToken, pageAddress, tokenOfNotesFolder } from './page-scheme'

const TOKEN = 'a'.repeat(32)
const PNG_BYTES = Buffer.from('89504e470d0a1a0a', 'hex')

describe('the ryte-page handler', () => {
  let root: string
  let outside: string
  let get: (url: string) => Promise<Response>

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ryte-page-')))
    outside = mkdtempSync(join(tmpdir(), 'ryte-page-outside-'))
    mkdirSync(join(root, 'pages'))
    mkdirSync(join(root, 'shared'))
    mkdirSync(join(root, '.obsidian'))
    writeFileSync(join(root, '.obsidian', 'data.json'), '{"token":"x"}')
    writeFileSync(join(root, 'pages', 'index.html'), '<h1>hi</h1>')
    writeFileSync(join(root, 'shared', 'style.css'), 'body{}')
    writeFileSync(join(root, 'shared', 'shot.png'), PNG_BYTES)
    writeFileSync(join(root, 'shared', 'note.md'), '# A note')
    writeFileSync(join(root, 'shared', 'data.bin'), 'bytes')
    writeFileSync(join(outside, 'secret.html'), 'secret')
    symlinkSync(join(outside, 'secret.html'), join(root, 'pages', 'link.html'))
    symlinkSync(outside, join(root, 'pages', 'out'))
    const handler = createPageHandler(() => root)
    get = (url) => handler({ method: 'GET', url })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  it('serves a file of a sibling folder, whatever the token', async () => {
    const style = await get(`ryte-page://${TOKEN}/shared/style.css`)
    expect(style.status).toBe(200)
    expect(await style.text()).toBe('body{}')
    expect(style.headers.get('content-type')).toBe('text/css; charset=utf-8')

    const picture = await get(`ryte-page://${'b'.repeat(32)}/shared/shot.png`)
    expect(Buffer.from(await picture.arrayBuffer())).toEqual(PNG_BYTES)
  })

  it('serves a Markdown note and a file of any other type', async () => {
    const note = await get(`ryte-page://${TOKEN}/shared/note.md`)
    expect(note.status).toBe(200)
    expect(await note.text()).toBe('# A note')
    const other = await get(`ryte-page://${TOKEN}/shared/data.bin`)
    expect(other.status).toBe(200)
    expect(await other.text()).toBe('bytes')
  })

  it('refuses everything outside the notes folder with a bare 404', async () => {
    const refused = [
      `ryte-page://${TOKEN}/../secret.html`,
      `ryte-page://${TOKEN}/%2e%2e/secret.html`,
      `ryte-page://${TOKEN}/pages/link.html`,
      `ryte-page://${TOKEN}/pages/out/secret.html`,
      `ryte-page://${TOKEN}/missing.html`,
      `ryte-page://${TOKEN}/.obsidian/data.json`
    ]
    for (const url of refused) {
      const response = await get(url)
      expect(response.status, url).toBe(404)
      expect(await response.text(), url).toBe('')
    }
  })

  it('gives the same folder the same token and another folder another', async () => {
    expect(folderToken(join(root, 'pages'))).toBe(folderToken(join(root, 'pages')))
    expect(folderToken(join(root, 'pages'))).not.toBe(folderToken(join(root, 'shared')))

    const address = await pageAddress(root, join(root, 'pages', 'index.html'))
    expect(address).toBe(`ryte-page://${folderToken(join(root, 'pages'))}/pages/index.html`)
    expect(tokenOfNotesFolder(root, 'pages/other.html')).toBe(folderToken(join(root, 'pages')))
  })
})
