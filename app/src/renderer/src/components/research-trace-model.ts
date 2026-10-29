import type { StructuredAnswer } from '../../../shared/answer-sections'
import type { SearchCitation, SearchSource, SearchStage } from '../../../preload/index'

export interface TraceLineSpec {
  id: string
  text: string
}

export interface TraceLine extends TraceLineSpec {
  state: 'active' | 'done'
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

const PATH_DATE = /(\d{4}-\d{2}-\d{2})/

/** The newest dated notes among the retrieved sources, newest first. */
export function newestSourcePaths(sources: SearchSource[], limit = 3): string[] {
  const dated = new Map<string, string>()
  for (const { sourcePath } of sources) {
    const date = PATH_DATE.exec(sourcePath)?.[1]
    if (date && !dated.has(sourcePath)) dated.set(sourcePath, date)
  }
  return [...dated.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, limit)
    .map(([path]) => path)
}

function listTitles(titles: string[]): string {
  const quoted = titles.map((title) => `“${title}”`)
  if (quoted.length <= 1) return quoted[0] ?? ''
  return `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)}`
}

interface LiveTraceInput {
  stage: SearchStage | null
  query: string
  /** Distinct files found so far; 0 until the local search reports its sources. */
  fileCount: number
  /** Titles of the newest notes found, newest first. */
  newestTitles: string[]
}

/**
 * Every plain-language line the search has earned so far, in order. A line exists once the work it
 * describes has happened, so the reasoning box is built from real events, never from a script.
 */
export function liveTraceLines(input: LiveTraceInput): TraceLineSpec[] {
  const gathering = input.stage === 'gathering-evidence' || input.stage === 'writing-summary'
  const lines: Array<TraceLineSpec | false> = [
    { id: 'search', text: `Looking through your notes for “${input.query}”` },
    input.fileCount > 0 && {
      id: 'found',
      text: `Found related notes in ${plural(input.fileCount, 'file')}`
    },
    input.newestTitles.length > 0 && {
      id: 'newest',
      text: `Starting with the newest ${input.newestTitles.length === 1 ? 'note' : 'notes'}, ${listTitles(input.newestTitles)}`
    },
    gathering && { id: 'gather', text: 'Picking out the most useful parts of each note' },
    input.stage === 'writing-summary' && {
      id: 'write',
      text: 'Writing a short summary of what your notes say'
    }
  ]
  return lines.filter((line): line is TraceLineSpec => line !== false)
}

interface BuildLinesInput {
  /** The answer typed so far, when it has the TL;DR-and-sections shape. */
  structured: StructuredAnswer | null
  /** Whether any text has been typed at all (for an answer without that shape). */
  hasText: boolean
  /** Title of the note the text being written right now draws on, if it has cited one. */
  currentSourceTitle: string | null
}

/**
 * Lines for the summary as it is written: one for the overview, one per area as it begins. The last
 * line also names the note the current passage draws on, so it keeps updating while that area is
 * being written.
 */
export function summaryBuildLines(input: BuildLinesInput): TraceLineSpec[] {
  const lines: TraceLineSpec[] = []
  if (!input.structured) {
    if (input.hasText) lines.push({ id: 'build-text', text: 'Writing the summary' })
  } else {
    if (input.structured.tldr)
      lines.push({ id: 'build-overview', text: 'Writing the short overview' })
    input.structured.sections.forEach((section, index) => {
      lines.push({ id: `build-section-${index}`, text: `Writing about “${section.title}”` })
    })
  }
  const last = lines.at(-1)
  if (last && input.currentSourceTitle) {
    last.text = `${last.text}, drawing on “${input.currentSourceTitle}”`
  }
  return lines
}

/** "Thought for 6s", never shorter than a second. */
export function formatThoughtFor(milliseconds: number): string {
  const seconds = Math.max(1, Math.round(milliseconds / 1000))
  return seconds < 60
    ? `Thought for ${seconds}s`
    : `Thought for ${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

interface SavedTraceInput {
  query: string
  sources: SearchSource[]
  citations: SearchCitation[]
}

/** What a restored summary can honestly say: it keeps no timing, only what it was built from. */
export function savedSummaryLines(input: SavedTraceInput): TraceLine[] {
  const fileCount = new Set(input.sources.map((source) => source.sourcePath)).size
  const citedCount = new Set(input.citations.map((citation) => citation.sourcePath)).size

  const lines = [`Looked through your notes for “${input.query}”`]
  if (fileCount > 0) lines.push(`Found related notes in ${plural(fileCount, 'file')}`)
  if (citedCount > 0) lines.push(`Wrote a short summary using ${plural(citedCount, 'note')}`)
  return lines.map((text, index) => ({ id: `saved-${index}`, text, state: 'done' }))
}

/** "October 23, 2026 at 5:19 PM EDT" in the viewer's locale and zone. */
export function formatGeneratedAt(timestamp: number, locale?: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    ...(timeZone ? { timeZone } : {})
  }).format(timestamp)
}

export interface FreshnessNoticeCopy {
  generated: string
  question: string
}

export function freshnessNoticeCopy(
  generatedAt: number,
  relevantCount: number,
  locale?: string,
  timeZone?: string
): FreshnessNoticeCopy {
  return {
    generated: formatGeneratedAt(generatedAt, locale, timeZone),
    question:
      relevantCount > 0
        ? `${plural(relevantCount, 'relevant file')} may affect it. Update the summary?`
        : 'Update the summary?'
  }
}
