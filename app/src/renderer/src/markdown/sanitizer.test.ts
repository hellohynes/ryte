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
})
