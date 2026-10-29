import type { SearchCitation } from '../../../preload/index'

const MARKER_RE = /\[(\d+)\]/g

export interface CitedSource {
  /** The number readers see: the order the document first appears in the text. */
  number: number
  sourcePath: string
  /** Every section of the document the answer cited. */
  headingPaths: string[][]
}

/**
 * Maps the model's internal citation indexes to reader-facing numbers. Numbers follow first
 * appearance in the text and are shared by every passage of one document, so they read 1, 2, 3 and
 * never change as more text streams in.
 */
export function citationNumbers(
  answerMarkdown: string,
  citations: SearchCitation[]
): Map<number, number> {
  const byIndex = new Map(citations.map((citation) => [citation.index, citation]))
  const numberByPath = new Map<string, number>()
  const numbers = new Map<number, number>()

  for (const match of answerMarkdown.matchAll(MARKER_RE)) {
    const index = Number(match[1])
    const citation = byIndex.get(index)
    if (!citation || numbers.has(index)) continue
    if (!numberByPath.has(citation.sourcePath)) {
      numberByPath.set(citation.sourcePath, numberByPath.size + 1)
    }
    numbers.set(index, numberByPath.get(citation.sourcePath) as number)
  }
  return numbers
}

/**
 * One entry per cited document, in reader-facing order, for the cited-sources column. Numbers come
 * from `answerMarkdown` (everything received), so they never change; only documents whose marker
 * appears in `visibleMarkdown` (what has been typed so far) are listed.
 */
export function buildCitedSources(
  answerMarkdown: string,
  citations: SearchCitation[],
  visibleMarkdown: string = answerMarkdown
): CitedSource[] {
  const numbers = citationNumbers(answerMarkdown, citations)
  const visible = new Set([...visibleMarkdown.matchAll(MARKER_RE)].map((match) => Number(match[1])))
  const sources = new Map<number, CitedSource>()

  for (const citation of citations) {
    const number = numbers.get(citation.index)
    if (number === undefined || !visible.has(citation.index)) continue
    const source = sources.get(number) ?? {
      number,
      sourcePath: citation.sourcePath,
      headingPaths: []
    }
    source.headingPaths.push(citation.headingPath)
    sources.set(number, source)
  }
  return [...sources.values()].sort((a, b) => a.number - b.number)
}

/** The answer text with markers rewritten to reader-facing numbers, for copy and export. */
export function renumberMarkdown(answerMarkdown: string, citations: SearchCitation[]): string {
  const numbers = citationNumbers(answerMarkdown, citations)
  return answerMarkdown.replace(MARKER_RE, (marker, digits: string) => {
    const number = numbers.get(Number(digits))
    return number === undefined ? marker : `[${number}]`
  })
}
