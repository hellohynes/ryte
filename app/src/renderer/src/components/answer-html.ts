import { documentTitle } from './search-result-model'
import type { SearchCitation } from '../../../preload/index'

// Text inside these elements is never rewritten: it is code, or already interactive.
const PROTECTED_TAGS = new Set(['a', 'button', 'code', 'pre'])

interface HtmlPart {
  value: string
  isText: boolean
  /** True when the text sits outside every protected element. */
  rewritable: boolean
}

function splitHtml(html: string): HtmlPart[] {
  let protectedDepth = 0
  return html
    .split(/(<[^>]*>)/)
    .filter((value) => value.length > 0)
    .map((value) => {
      if (!value.startsWith('<')) {
        return { value, isText: true, rewritable: protectedDepth === 0 }
      }
      const tag = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(value)
      if (tag && PROTECTED_TAGS.has(tag[2].toLowerCase()) && !value.endsWith('/>')) {
        protectedDepth = Math.max(0, protectedDepth + (tag[1] ? -1 : 1))
      }
      return { value, isText: false, rewritable: false }
    })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Replaces `[n]` markers that match a citation with superscript buttons. The visible number is the
 * reader-facing one from `numbers` (first appearance, one per document), and the button carries it
 * so the overlay can pair the marker with its cited-source row. Space before a marker is dropped
 * so it sits against the sentence it supports, and a name for the source is in the accessible label
 * so pairing never depends on hover.
 */
export function linkAnswerCitations(
  html: string,
  citations: SearchCitation[],
  numbers: Map<number, number>
): string {
  if (citations.length === 0 || numbers.size === 0) return html
  const byIndex = new Map(citations.map((citation) => [citation.index, citation]))

  return splitHtml(html)
    .map((part) => {
      if (!part.isText || !part.rewritable) return part.value
      return part.value.replace(/(\s*)(\[\d+\](?: ?\[\d+\])*)/g, (whole, _space: string, group) => {
        let previous: number | undefined
        let linked = 0
        const rest = (group as string).replace(/\[(\d+)\]/g, (raw, digits: string) => {
          const citation = byIndex.get(Number(digits))
          const number = numbers.get(Number(digits))
          if (!citation || number === undefined) return raw
          linked += 1
          if (number === previous) return ''
          previous = number
          const title = escapeHtml(documentTitle(citation.sourcePath))
          return (
            `<sup class="answer-citation-ref"><button type="button" class="answer-citation" ` +
            `data-citation-index="${number}" aria-label="Source ${number}: ${title}">` +
            `${number}</button></sup>`
          )
        })
        if (linked === 0) return whole
        return rest.replace(/<\/sup> +<sup/g, '</sup><sup')
      })
    })
    .join('')
}

const CARET = '<span class="answer-caret" aria-hidden="true"></span>'

/** Places the typing caret at the end of the text, inside the last paragraph or list item. */
export function appendCaret(html: string): string {
  const close = Math.max(
    ...['</p>', '</li>', '</h1>', '</h2>', '</h3>', '</h4>'].map((tag) => html.lastIndexOf(tag))
  )
  return close === -1 ? html + CARET : html.slice(0, close) + CARET + html.slice(close)
}

/** A rendered single paragraph without its wrapper, for text that sits inside another element. */
export function stripParagraph(html: string): string {
  const match = /^<p>([\s\S]*)<\/p>\s*$/.exec(html)
  return match && !match[1].includes('<p>') ? match[1] : html
}
