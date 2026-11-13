import { describe, expect, it } from 'vitest'

import { isSubframeAllowed, pageMoveVerdict } from './page-moves'

const OWN = 'a'.repeat(32)
const OTHER = 'b'.repeat(32)
const tokenOfFolder = (file: string): string | null =>
  file.startsWith('gone/') ? null : file.startsWith('other/') ? OTHER : OWN

describe('moving between pages', () => {
  it('stays on its own token for a page in its folder', () => {
    expect(pageMoveVerdict(`ryte-page://${OWN}/a/details.html`, tokenOfFolder)).toBe(true)
  })

  it('lands on the token of the other folder, keeping the query and the anchor', () => {
    expect(pageMoveVerdict(`ryte-page://${OWN}/other/page.htm?x=1#top`, tokenOfFolder)).toBe(
      `ryte-page://${OTHER}/other/page.htm?x=1#top`
    )
  })

  it('refuses anything that is not an HTML page of the notes folder', () => {
    for (const url of [
      `ryte-page://${OWN}/media/shot.png`,
      `ryte-page://${OWN}/%2e%2e/x.html`,
      `ryte-page://${OWN}/gone/page.html`,
      'https://example.com/details.html',
      'ryte-file://notes/details.html'
    ]) {
      expect(pageMoveVerdict(url, tokenOfFolder), url).toBe(false)
    }
  })
})

describe('frames inside a page', () => {
  it('may load the web and the notes pages, but not local files or the notes through ryte-file', () => {
    expect(isSubframeAllowed('https://example.com/embed')).toBe(true)
    expect(isSubframeAllowed(`ryte-page://${OWN}/a/part.html`)).toBe(true)
    expect(isSubframeAllowed('file:///etc/hosts')).toBe(false)
    expect(isSubframeAllowed('ryte-file://notes/secret.md')).toBe(false)
  })
})
