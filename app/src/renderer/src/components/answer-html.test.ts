import { describe, expect, it } from 'vitest'

import { appendCaret, linkAnswerCitations, stripParagraph } from './answer-html'
import type { SearchCitation } from '../../../preload/index'

describe('linkAnswerCitations', () => {
  // Passages 7 and 9 are the same document; 13 is another.
  const docs: SearchCitation[] = [
    { index: 7, sourcePath: 'plans/jira-mcp.md', headingPath: ['Plan'] },
    { index: 9, sourcePath: 'plans/jira-mcp.md', headingPath: ['Risks'] },
    { index: 13, sourcePath: 'plans/spine.md', headingPath: [] }
  ]
  const numbers = new Map([
    [7, 1],
    [9, 1],
    [13, 2]
  ])
  const marker = (n: number, title: string): string =>
    `<sup class="answer-citation-ref"><button type="button" class="answer-citation" data-citation-index="${n}" aria-label="Source ${n}: ${title}">${n}</button></sup>`

  it('turns known bracket markers into superscript buttons showing the reader-facing number', () => {
    expect(linkAnswerCitations('<p>Skip Jira[7].</p>', docs, numbers)).toBe(
      `<p>Skip Jira${marker(1, 'jira-mcp')}.</p>`
    )
  })

  it('attaches a marker to the sentence it follows instead of floating before the next one', () => {
    expect(linkAnswerCitations('<p>It disagrees. [13] Separately, more.</p>', docs, numbers)).toBe(
      `<p>It disagrees.${marker(2, 'spine')} Separately, more.</p>`
    )
  })

  it('leaves unknown markers and their spacing as plain text', () => {
    expect(linkAnswerCitations('<p>See [5].</p>', docs, numbers)).toBe('<p>See [5].</p>')
    expect(linkAnswerCitations('<p>See [5].</p>', docs, new Map())).toBe('<p>See [5].</p>')
  })

  it('packs adjacent markers together and shows one marker per document', () => {
    const html = linkAnswerCitations('<p>Both [7] [9] [13]</p>', docs, numbers)
    expect(html).toBe(`<p>Both${marker(1, 'jira-mcp')}${marker(2, 'spine')}</p>`)
  })

  it('does not rewrite code, links or existing buttons', () => {
    const input = '<pre><code>a[7]</code></pre><a href="x">b[7]</a><code>c[13]</code>'
    expect(linkAnswerCitations(input, docs, numbers)).toBe(input)
  })

  it('escapes titles derived from file names', () => {
    const html = linkAnswerCitations(
      '<p>x[1]</p>',
      [{ index: 1, sourcePath: 'a/"><img src=x>.md', headingPath: [] }],
      new Map([[1, 1]])
    )
    expect(html).not.toContain('<img')
    expect(html).toContain('&quot;&gt;&lt;img src=x&gt;')
  })
})

describe('appendCaret', () => {
  const caret = '<span class="answer-caret" aria-hidden="true"></span>'

  it('puts the caret at the end of the last paragraph, inside it', () => {
    expect(appendCaret('<p>One.</p>\n<p>Two words</p>\n')).toBe(
      `<p>One.</p>\n<p>Two words${caret}</p>\n`
    )
  })

  it('goes inside the last list item', () => {
    expect(appendCaret('<ul><li>a</li><li>b</li></ul>')).toBe(
      `<ul><li>a</li><li>b${caret}</li></ul>`
    )
  })

  it('appends after content that has no closing block tag', () => {
    expect(appendCaret('plain')).toBe(`plain${caret}`)
  })
})

describe('stripParagraph', () => {
  it('unwraps a single rendered paragraph so it can sit inline', () => {
    expect(stripParagraph('<p>Wrote the <strong>plan</strong> [2]</p>\n')).toBe(
      'Wrote the <strong>plan</strong> [2]'
    )
  })

  it('leaves other markup alone', () => {
    expect(stripParagraph('<ul><li>a</li></ul>')).toBe('<ul><li>a</li></ul>')
    expect(stripParagraph('<p>One</p><p>Two</p>')).toBe('<p>One</p><p>Two</p>')
  })
})
