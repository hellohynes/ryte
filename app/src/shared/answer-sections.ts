export interface AnswerSection {
  title: string
  body: string
}

export interface StructuredAnswer {
  tldr: string
  sections: AnswerSection[]
}

const TLDR_HEADING = /^#{1,3}[ \t]*tl;?[ \t]?dr[ \t]*:?[ \t]*(?:\r?\n|$)/i
const SECTION_HEADING = /^#{1,3}[ \t]+(.+?)[ \t]*#*[ \t]*$/
const FENCE = /^[ \t]*(```|~~~)/

function cleanTitle(raw: string): string {
  return raw
    .replace(/[*_`]/g, '')
    .replace(/[ \t]*:$/, '')
    .trim()
}

/**
 * Reads the answer shape the model is asked for: a `## TL;DR`, then one `##` section per area.
 * Returns null for any other answer (older saved summaries, an unexpected reply) so the caller can
 * render it as plain Markdown. While the TL;DR heading is still streaming in it returns an empty
 * structure, so a half-typed heading never flashes as ordinary text.
 */
export function parseStructuredAnswer(markdown: string): StructuredAnswer | null {
  const text = markdown.replace(/^\s+/, '')
  if (text.length === 0) return null
  if ('## tl;dr'.startsWith(text.toLowerCase().trimEnd())) return { tldr: '', sections: [] }

  const head = TLDR_HEADING.exec(text)
  if (!head) return null

  const sections: Array<{ title: string; lines: string[] }> = []
  const leadLines: string[] = []
  let inFence = false

  const lines = text.slice(head[0].length).split(/\r?\n/)
  for (const [position, line] of lines.entries()) {
    if (FENCE.test(line)) inFence = !inFence
    const heading = inFence ? null : SECTION_HEADING.exec(line)
    // A last line without a newline may still be growing, so a heading there is not shown yet. Only
    // a heading is held back: "#252 shipped" is ordinary text and shows as it is typed.
    if (position === lines.length - 1 && /^#{1,3}(?:[ \t]|$)/.test(line)) continue
    if (heading) {
      sections.push({ title: cleanTitle(heading[1]), lines: [] })
    } else {
      ;(sections.at(-1)?.lines ?? leadLines).push(line)
    }
  }

  const finished = sections.map((section) => ({
    title: section.title,
    body: section.lines.join('\n').trim()
  }))
  return {
    tldr: leadLines.join('\n').trim(),
    // An empty section followed by another heading would be stacked headlines with no content.
    sections: finished.filter((section, index) => section.body || index === finished.length - 1)
  }
}
