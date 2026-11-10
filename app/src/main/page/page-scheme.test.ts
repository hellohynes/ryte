import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createPageFolderHandler, createPageFolders } from './page-scheme'

const ID = 'a'.repeat(32)
const OTHER_ID = 'b'.repeat(32)
const PNG_BYTES = Buffer.from('89504e470d0a1a0a', 'hex')

describe('the ryte-page folder handler', () => {
  let folder: string
  let outside: string
  let get: (url: string) => Promise<Response>

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'ryte-page-'))
    outside = mkdtempSync(join(tmpdir(), 'ryte-page-outside-'))
    mkdirSync(join(folder, 'media'))
    mkdirSync(join(folder, '.obsidian'))
    mkdirSync(join(folder, 'node_modules', 'pkg'), { recursive: true })
    writeFileSync(join(folder, '.obsidian', 'data.json'), '{"token":"x"}')
    writeFileSync(join(folder, 'node_modules', 'pkg', 'index.js'), 'x')
    writeFileSync(join(folder, 'index.html'), '<h1>hi</h1>')
    writeFileSync(join(folder, 'media', 'shot.png'), PNG_BYTES)
    writeFileSync(join(outside, 'secret.html'), 'secret')
    symlinkSync(join(outside, 'secret.html'), join(folder, 'link.html'))

    const registered = createPageFolders(() => ID)
    registered.open(folder)
    const handler = createPageFolderHandler(registered)
    get = (url) => handler({ method: 'GET', url })
  })

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  it('serves a page and a picture from its media folder', async () => {
    const page = await get(`ryte-page://${ID}/index.html`)
    expect(page.status).toBe(200)
    expect(await page.text()).toBe('<h1>hi</h1>')
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8')

    const picture = await get(`ryte-page://${ID}/media/shot.png`)
    expect(picture.status).toBe(200)
    expect(Buffer.from(await picture.arrayBuffer())).toEqual(PNG_BYTES)
    expect(picture.headers.get('content-type')).toBe('image/png')
  })

  it('refuses everything outside the folder with a bare 404', async () => {
    const refused = [
      `ryte-page://${ID}/../secret.html`,
      `ryte-page://${ID}/%2e%2e/secret.html`,
      `ryte-page://${ID}/media/%2E%2E/%2E%2E/secret.html`,
      `ryte-page://${ID}/link.html`,
      `ryte-page://${OTHER_ID}/index.html`,
      `ryte-page://${ID}/missing.html`,
      `ryte-page://${ID}/.obsidian/data.json`,
      `ryte-page://${ID}/node_modules/pkg/index.js`
    ]
    for (const url of refused) {
      const response = await get(url)
      expect(response.status, url).toBe(404)
      expect(await response.text(), url).toBe('')
    }
  })

  it('sends the content policy that keeps the page on its own origin', async () => {
    const response = await get(`ryte-page://${ID}/index.html`)
    const policy = response.headers.get('content-security-policy')!
    expect(policy).toContain("connect-src 'none'")
    expect(policy).toContain(`default-src ryte-page://${ID}`)
  })
})
