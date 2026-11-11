/** The rules behind the document outline: which headings it lists and which one is current. */
import type { MarkdownOutlineItem } from '../markdown/renderer'

/** The outline lists section headings (`##` to `####`). The page title (`#`) is not an entry. */
export function sectionOutlineOf(outline: readonly MarkdownOutlineItem[]): MarkdownOutlineItem[] {
  return outline.filter((item) => item.level >= 2 && item.level <= 4)
}

/**
 * The current section is the last heading at or above `line`. Before the first heading the first one is
 * current, so the outline always has a marked entry.
 */
export function currentSectionId(
  sections: readonly MarkdownOutlineItem[],
  topOf: (id: string) => number | null,
  line: number
): string {
  let current = sections[0]?.id ?? ''
  for (const item of sections) {
    const top = topOf(item.id)
    if (top !== null && top <= line) current = item.id
  }
  return current
}
