import { readFileSync } from 'node:fs'
import { relative } from 'node:path'

import matter from 'gray-matter'

export const TARGET_CHARS = 2000
export const MAX_CHARS = 4000

export interface Chunk {
  text: string
  sourcePath: string
  headingPath: string[]
  date: string | null
  frontmatter: Record<string, unknown>
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/
const DATE_RE = /(\d{4}-\d{2}-\d{2})/
const PARA_SPLIT_RE = /\n\s*\n/

export function chunkFile(absPath: string, notesRoot: string): Chunk[] {
  const raw = readFileSync(absPath, 'utf-8')
  const sourcePath = relative(notesRoot, absPath)
  let parsed: matter.GrayMatterFile<string>
  try {
    // Passing options skips gray-matter's cache, which keeps the text of every file it has read for the life of the process and
    // returns a half-parsed result for a text that failed before.
    parsed = matter(raw, {})
  } catch {
    // Front matter that is not valid YAML (an unquoted colon inside a value is the usual cause) must not keep the note, or the
    // notes after it, out of the index. The note is kept whole, front matter lines included, with no fields.
    return chunkMarkdown(raw, sourcePath, {})
  }
  return chunkMarkdown(parsed.content, sourcePath, parsed.data as Record<string, unknown>)
}

export function chunkMarkdown(
  body: string,
  sourcePath: string,
  frontmatter: Record<string, unknown>
): Chunk[] {
  const date = extractDateFromPath(sourcePath)
  const sections = splitByHeadings(body)
  const chunks: Chunk[] = []

  for (const [headingPath, sectionBody] of sections) {
    if (sectionBody.trim().length === 0) continue
    const prefix = headingPath.length > 0 ? headingPath.join(' > ') + '\n\n' : ''
    const full = prefix + sectionBody

    if (full.length <= MAX_CHARS) {
      chunks.push({ text: full, sourcePath, headingPath, date, frontmatter })
      continue
    }

    for (const piece of splitLargeBody(full, MAX_CHARS)) {
      chunks.push({ text: piece, sourcePath, headingPath, date, frontmatter })
    }
  }

  return chunks
}

function extractDateFromPath(relPath: string): string | null {
  const m = DATE_RE.exec(relPath)
  return m ? m[1] : null
}

function splitByHeadings(text: string): Array<[string[], string]> {
  const lines = text.split('\n')
  const stack: Array<{ level: number; title: string }> = []
  const sections: Array<[string[], string[]]> = []
  let currentBody: string[] = []
  let currentPath: string[] = []

  const flush = (): void => {
    if (currentBody.length > 0) {
      sections.push([[...currentPath], [...currentBody]])
      currentBody = []
    }
  }

  for (const line of lines) {
    const m = HEADING_RE.exec(line)
    if (m) {
      const level = m[1].length
      const title = m[2]
      flush()
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop()
      }
      stack.push({ level, title })
      currentPath = stack.map((s) => s.title)
    } else {
      currentBody.push(line)
    }
  }
  flush()

  if (sections.length === 0) {
    return [[[], text]]
  }
  return sections
    .map(([path, body]) => [path, body.join('\n').trim()] as [string[], string])
    .filter(([, body]) => body.length > 0)
}

function splitLargeBody(body: string, maxChars: number): string[] {
  if (body.length <= maxChars) return [body]
  const pieces: string[] = []
  const paragraphs = body.split(PARA_SPLIT_RE)
  let buf = ''

  for (const p of paragraphs) {
    if (buf.length + p.length + 2 <= maxChars) {
      buf = buf ? `${buf}\n\n${p}` : p
      continue
    }
    if (buf) {
      pieces.push(buf)
      buf = ''
    }
    if (p.length <= maxChars) {
      buf = p
    } else {
      for (let i = 0; i < p.length; i += maxChars) {
        pieces.push(p.slice(i, i + maxChars))
      }
    }
  }
  if (buf) pieces.push(buf)
  return pieces
}
