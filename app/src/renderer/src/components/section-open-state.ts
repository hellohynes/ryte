interface SectionOpenInput {
  /** What the reader chose by clicking, if anything; it always wins. */
  override: boolean | undefined
  /** This section's own text is still being written. */
  writing: boolean
  /** Any of the section's text has been typed yet. */
  hasBody: boolean
}

/**
 * Whether a summary section is open. A section arrives collapsed with just its title, opens when its
 * own text starts, and collapses when that text is finished, so several sections can be open at
 * once while they write and a finished summary rests as a short list of titles.
 */
export function sectionOpen(input: SectionOpenInput): boolean {
  if (input.override !== undefined) return input.override
  return input.writing && input.hasBody
}
