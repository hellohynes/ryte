import { describe, expect, it } from 'vitest'

import { sanitizeRenderedHtml } from './sanitizer'

describe('sanitizeRenderedHtml', () => {
  it('removes event handlers and srcdoc from real tags', () => {
    expect(
      sanitizeRenderedHtml(
        '<button type="button" onclick="x()" ONMOUSEOVER=y>a</button><iframe srcdoc="<b>"></iframe>'
      )
    ).toBe('<button type="button">a</button><iframe></iframe>')
  })

  it('keeps a link to a page on this Mac, and only as a link', () => {
    expect(
      sanitizeRenderedHtml(
        '<a href="http://localhost:5173/">a</a><a href="http://example.com/">b</a><img src="http://localhost:5173/x.png">'
      )
    ).toBe('<a href="http://localhost:5173/">a</a><a>b</a><img>')
  })

  it('keeps https, mailto and fragment targets and removes every other scheme', () => {
    expect(
      sanitizeRenderedHtml(
        '<a href="https://example.com">a</a><a href=\'mailto:a@example.com\'>b</a><a href="#top">c</a>' +
          '<a href="javascript:alert(1)">d</a><img src="file:///etc/hosts"><a href="data:text/html,x">e</a>'
      )
    ).toBe(
      '<a href="https://example.com">a</a><a href="mailto:a@example.com">b</a><a href="#top">c</a>' +
        '<a>d</a><img><a>e</a>'
    )
  })

  it('allows notes-folder pictures on img src only', () => {
    expect(
      sanitizeRenderedHtml(
        '<img src="ryte-file://notes/a.png"><a href="ryte-file://notes/a.png">a</a>' +
          '<iframe src="ryte-file://notes/a.png"></iframe><img src="ryte-file://notes/%2e%2e/a.png">' +
          '<img src="ryte-file://other/a.png">'
      )
    ).toBe('<img src="ryte-file://notes/a.png"><a>a</a><iframe></iframe><img><img>')
  })

  it('keeps only a notes-folder src, controls and preload metadata on a video', () => {
    expect(
      sanitizeRenderedHtml(
        '<video src="ryte-file://notes/a.mp4" autoplay loop muted poster="ryte-file://notes/p.png" ' +
          'onplay="x()" class="big" preload="auto"><source src="ryte-file://notes/a.mp4">' +
          '<track src="ryte-file://notes/a.vtt"></video>'
      )
    ).toBe('<video src="ryte-file://notes/a.mp4" controls preload="metadata"></video>')
  })

  it('removes a video src that is not a notes-folder video, and ryte-file on other tags', () => {
    expect(
      sanitizeRenderedHtml(
        '<video src="https://example.com/a.mp4"></video><video src="ryte-file://notes/a.png"></video>' +
          '<video src="ryte-file://notes/%2e%2e/a.mp4"></video><audio src="ryte-file://notes/a.mp4"></audio>' +
          '<embed src="ryte-file://notes/a.mp4">'
      )
    ).toBe(
      '<video controls preload="metadata"></video><video controls preload="metadata"></video>' +
        '<video controls preload="metadata"></video><audio></audio><embed>'
    )
  })
})
