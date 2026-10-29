export type TimelineStatus = 'done' | 'now' | 'next'

export interface TimelineItem {
  status: TimelineStatus
  /** A short date such as "October 9", when the model gave one. */
  date: string | null
  /** Tickets and PRs the step names: "DDT-1234", "PR #123", or a full web address. */
  refs: string[]
  text: string
}

// "- Done (October 9, PR #123, DDT-1234): text", also with bold labels (**Done**:) and other bullets.
// Written so no two neighbouring parts can match the same characters: the text is a model's, and a
// pattern that can split a run of spaces more than one way takes cubic time on it.
// A list marker, spaces, then an optional bold marker: `**Done**: x` on its own is a label, not a step.
const STEP = /^[-*]\s+(?:\*+\s*)?(done|now|next)(?:\s*\(([^)]+)\))?[*\s]*:[*\s]*(\S.*)$/i
// A line past this length is not a timeline step; it is cut so a runaway reply stays cheap to read.
const MAX_LINE_LENGTH = 4000
const REFERENCE = /^(?:PR\s*#?\d+|#\d+|[A-Z][A-Z0-9]*-\d+|https:\/\/[^\s,;()]+)$/

/** True for the section the model uses for the Done / Now / Next list. */
export function isTimelineTitle(title: string): boolean {
  return title.trim().toLowerCase() === 'timeline'
}

/**
 * Reads the steps of a timeline section. A step appears once it has its label and some text, so a
 * line that is still being typed ("- Done (Oc") is not shown until it can be read.
 */
export function parseTimelineItems(body: string): TimelineItem[] {
  const items: TimelineItem[] = []
  for (const line of body.split(/\r?\n/)) {
    const match = STEP.exec(line.trim().slice(0, MAX_LINE_LENGTH))
    if (!match) continue
    const parts = (match[2] ?? '')
      .split(/[,;]/)
      .map((part) => part.trim())
      .filter(Boolean)
    items.push({
      status: match[1].toLowerCase() as TimelineStatus,
      date: parts.find((part) => !REFERENCE.test(part)) ?? null,
      refs: parts.filter((part) => REFERENCE.test(part)),
      text: match[3]
    })
  }
  return items
}
