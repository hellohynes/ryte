import { advanceDisplayed, safeDisplayLength } from './answer-pacing'

// Gap between one section title coming in and the next, once the overview is written.
export const SECTION_STAGGER_MS = 1400
// How long a title sits on its own, collapsed, before its text starts to type.
export const SECTION_BEAT_MS = 700

/** The answer as received so far, split into the pieces that are typed independently. */
export interface TypingPieces {
  /** False for an answer that is not the TL;DR-and-sections shape: it is typed as one block. */
  structured: boolean
  lead: string
  sections: Array<{ title: string; body: string }>
}

export interface SectionTyping {
  /** Characters of the section's text on screen; fractional so slow typing stays smooth. */
  shown: number
  /** When the title came in, or null while it is still waiting its turn. */
  titleAt: number | null
}

export interface TypingState {
  lead: number
  leadDoneAt: number | null
  sections: SectionTyping[]
}

export function initialTyping(): TypingState {
  return { lead: 0, leadDoneAt: null, sections: [] }
}

function leadComplete(pieces: TypingPieces, state: TypingState, finished: boolean): boolean {
  // More text may still follow the overview until a section starts or the run is over.
  return state.lead >= pieces.lead.length && (pieces.sections.length > 0 || finished)
}

function bodyComplete(
  pieces: TypingPieces,
  index: number,
  state: TypingState,
  finished: boolean
): boolean {
  const shown = state.sections[index]?.shown ?? 0
  const more = index < pieces.sections.length - 1 || finished
  return more && shown >= pieces.sections[index].body.length
}

/**
 * Moves the typing forward. The overview types first. When it is done every section title comes in
 * one after another, and each section's text starts a beat after its title; from then on the
 * sections type at the same time, each at its own pace. Text that has not arrived yet cannot be
 * shown, so a slow provider simply makes a section wait.
 */
export function advanceTyping(
  state: TypingState,
  pieces: TypingPieces,
  now: number,
  elapsedMs: number,
  finished: boolean
): TypingState {
  const lead = advanceDisplayed(state.lead, pieces.lead.length, elapsedMs, finished)
  const advanced: TypingState = { ...state, lead }
  const leadDoneAt = state.leadDoneAt ?? (leadComplete(pieces, advanced, finished) ? now : null)

  const sections = pieces.sections.map((section, index): SectionTyping => {
    const previous = state.sections[index] ?? { shown: 0, titleAt: null }
    let titleAt = previous.titleAt
    if (titleAt === null && leadDoneAt !== null && now >= leadDoneAt + index * SECTION_STAGGER_MS) {
      titleAt = now
    }
    if (titleAt === null) return previous

    const typingSince = now - (titleAt + SECTION_BEAT_MS)
    if (typingSince <= 0) return { shown: previous.shown, titleAt }
    return {
      shown: advanceDisplayed(
        previous.shown,
        section.body.length,
        Math.min(elapsedMs, typingSince),
        finished
      ),
      titleAt
    }
  })

  return { lead, leadDoneAt, sections }
}

/** The Markdown to show right now, rebuilt from what each piece has typed so far. */
export function typedMarkdown(pieces: TypingPieces, state: TypingState): string {
  const lead = pieces.lead.slice(0, safeDisplayLength(pieces.lead, Math.floor(state.lead)))
  if (!pieces.structured) return lead

  const parts = [`## TL;DR\n${lead}`]
  pieces.sections.forEach((section, index) => {
    const typing = state.sections[index]
    if (!typing || typing.titleAt === null) return
    const body = section.body.slice(0, safeDisplayLength(section.body, Math.floor(typing.shown)))
    parts.push(`## ${section.title}\n${body}`)
  })
  return parts.join('\n\n')
}

/** Which pieces are still being written, for the caret and for opening sections. */
export function writingFlags(
  pieces: TypingPieces,
  state: TypingState,
  finished: boolean
): { lead: boolean; sections: boolean[] } {
  return {
    lead: !leadComplete(pieces, state, finished),
    sections: pieces.sections.map(
      (_section, index) =>
        state.sections[index]?.titleAt != null && !bodyComplete(pieces, index, state, finished)
    )
  }
}

export function typingComplete(
  pieces: TypingPieces,
  state: TypingState,
  finished: boolean
): boolean {
  return (
    finished &&
    leadComplete(pieces, state, finished) &&
    pieces.sections.every(
      (_section, index) =>
        state.sections[index]?.titleAt != null && bodyComplete(pieces, index, state, finished)
    )
  )
}
