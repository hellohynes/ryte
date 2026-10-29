const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---(?:\n|$)/
const FRONTMATTER_TITLE_RE = /^title\s*:\s*(.+?)\s*$/im
const HEADING_RE = /^#{1,6}\s+(.+?)\s*#*\s*$/
const H1_RE = /^#\s+(.+?)\s*#*\s*$/

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function cleanTitleText(value: string): string | null {
  const cleaned = stripWrappingQuotes(value).trim()
  return cleaned.length > 0 ? cleaned : null
}

function firstReadableLine(body: string): string | null {
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (!line || line === '---') continue

    const heading = HEADING_RE.exec(line)
    return cleanTitleText(heading?.[1] ?? line)
  }

  return null
}

export function extractMarkdownTitle(raw: string): string | null {
  const normalized = normalizeLineEndings(raw)
  const frontmatter = FRONTMATTER_RE.exec(normalized)
  let body = normalized

  if (frontmatter) {
    const frontmatterTitle = FRONTMATTER_TITLE_RE.exec(frontmatter[1])
    const title = frontmatterTitle ? cleanTitleText(frontmatterTitle[1]) : null
    if (title) return title
    body = normalized.slice(frontmatter[0].length)
  }

  for (const line of body.split('\n')) {
    const h1 = H1_RE.exec(line.trim())
    const title = h1 ? cleanTitleText(h1[1]) : null
    if (title) return title
  }

  return firstReadableLine(body)
}
