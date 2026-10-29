import type { CitedSource } from './cited-sources'

export interface AnswerClipboard {
  markdown: string
  html: string
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Builds the two clipboard flavors for an answer whose markers already use reader-facing numbers:
 * Markdown (inline `[n]` intact) and rendered HTML with superscript markers. Both end with a
 * numbered list of the cited documents so a pasted answer keeps its provenance.
 */
export function buildAnswerClipboard(
  numberedMarkdown: string,
  sources: CitedSource[],
  renderedHtml: string
): AnswerClipboard {
  if (sources.length === 0) return { markdown: numberedMarkdown, html: renderedHtml }

  const known = new Set(sources.map((source) => source.number))
  const markdown = [
    numberedMarkdown.trimEnd(),
    '',
    '## Sources',
    '',
    ...sources.map((source) => `${source.number}. [${source.number}] ${source.sourcePath}`)
  ].join('\n')

  const body = renderedHtml.replace(/\[(\d+)\]/g, (marker, digits: string) =>
    known.has(Number(digits)) ? `<sup>${digits}</sup>` : marker
  )
  const items = sources
    .map((source) => `<li value="${source.number}">${escapeHtml(source.sourcePath)}</li>`)
    .join('')
  return { markdown, html: `${body}<h2>Sources</h2><ol>${items}</ol>` }
}
