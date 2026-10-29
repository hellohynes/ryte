import { buildCitedSources, citationNumbers, type CitedSource } from './cited-sources'
import type { SearchCitation } from '../../../preload/index'
import type { PreviousSummary } from '../stores/search'

/** Which pieces of the summary are being written now; mirrors the presentation's flags. */
interface WritingFlags {
  lead: boolean
  sections: boolean[]
}

/** What the answer area shows right now. */
export interface SummaryView {
  /** The summary being updated is still on screen because the new one has not started writing. */
  holding: boolean
  answer: string
  citations: SearchCitation[]
  numbers: Map<number, number>
  sources: CitedSource[]
  typing: boolean
  writing: WritingFlags
}

const NOT_WRITING: WritingFlags = { lead: false, sections: [] }

/**
 * An update keeps the old summary on screen while it searches, and swaps to the new one the moment
 * its first words are typed. Nothing is typed into the old summary and none of its sources are
 * pending, so it reads as finished work that is about to be replaced.
 */
export function summaryView(
  previous: PreviousSummary | null,
  live: Omit<SummaryView, 'holding'>
): SummaryView {
  if (previous === null || live.answer !== '') return { holding: false, ...live }
  return {
    holding: true,
    answer: previous.answer,
    citations: previous.citations,
    numbers: citationNumbers(previous.answer, previous.citations),
    sources: buildCitedSources(previous.answer, previous.citations),
    typing: false,
    writing: NOT_WRITING
  }
}
