import {
  canOpenCodeExtension,
  codeFileExtension,
  type CodeLanguageId
} from '../../../shared/code-files'

export type CodeReadResult = Awaited<ReturnType<Window['ryte']['code']['read']>>

/** What the code view shows for one file: the text, the language to color it with, and an optional notice. */
export interface CodeView {
  text: string
  /** Null shows the text uncolored. */
  language: CodeLanguageId | null
  notice: 'invalid-json' | 'formatted' | null
}

/** A JSON file is squashed when its longest line is over this long and holds most of the file. */
const SQUASHED_LINE_LENGTH = 2000

function longestLineLength(text: string): number {
  let longest = 0
  let start = 0
  while (start <= text.length) {
    const end = text.indexOf('\n', start)
    const lineEnd = end < 0 ? text.length : end
    longest = Math.max(longest, lineEnd - start)
    if (end < 0) break
    start = end + 1
  }
  return longest
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r'])

/**
 * Lays out valid JSON with two-space indents, one value per line. It re-spaces the text instead of parsing it, so
 * numbers and strings stay exactly as written. Laying out its own output changes nothing.
 */
function layOutJson(text: string): string {
  const out: string[] = []
  const indent = (depth: number): string => '\n' + '  '.repeat(depth)
  let depth = 0
  let i = 0
  while (i < text.length) {
    const ch = text[i]!
    if (ch === '"') {
      let end = i + 1
      while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1
      out.push(text.slice(i, end + 1))
      i = end + 1
    } else if (WHITESPACE.has(ch)) {
      i += 1
    } else if (ch === '{' || ch === '[') {
      let next = i + 1
      while (next < text.length && WHITESPACE.has(text[next]!)) next += 1
      if (text[next] === (ch === '{' ? '}' : ']')) {
        out.push(ch + text[next])
        i = next + 1
      } else {
        depth += 1
        out.push(ch, indent(depth))
        i += 1
      }
    } else if (ch === '}' || ch === ']') {
      depth -= 1
      out.push(indent(depth), ch)
      i += 1
    } else if (ch === ',') {
      out.push(',', indent(depth))
      i += 1
    } else if (ch === ':') {
      out.push(': ')
      i += 1
    } else {
      let end = i
      while (end < text.length && !'{}[],:" \t\n\r'.includes(text[end]!)) end += 1
      out.push(text.slice(i, end))
      i = end
    }
  }
  return out.join('') + '\n'
}

/**
 * Decides how a file's text is shown. Everything shows exactly as written, with two exceptions for JSON: text that
 * is not valid JSON shows uncolored with a notice, and a squashed file (one line over 2,000 characters that holds
 * more than half the file) is laid out with a notice. A laid-out file with one long value stays as written. Other languages are never changed.
 */
export function prepareCodeView(language: CodeLanguageId | null, text: string): CodeView {
  if (language !== 'json' || text.trim() === '') return { text, language, notice: null }

  try {
    JSON.parse(text)
  } catch {
    return { text, language: null, notice: 'invalid-json' }
  }

  const longest = longestLineLength(text)
  if (longest > SQUASHED_LINE_LENGTH && longest > text.length / 2) {
    const laidOut = layOutJson(text)
    if (laidOut !== text) return { text: laidOut, language, notice: 'formatted' }
  }
  return { text, language, notice: null }
}

export const CODE_VIEW_NOTICE_TEXT: Record<NonNullable<CodeView['notice']>, string> = {
  'invalid-json': "This isn't valid JSON, so it shows as plain text.",
  formatted:
    "Formatted for reading. This file is on one very long line, so line numbers don't match the file."
}

export interface CodeProblemText {
  detail: string
  /** Offer to open it in the default app: only for a too-large file whose type may be opened. */
  canOpen: boolean
}

const MEGABYTE = 1024 * 1024

/** The box that takes the view's place when a code file can't be shown. */
export function describeCodeProblem(
  result: Exclude<CodeReadResult, { status: 'ok' }>,
  path: string
): CodeProblemText {
  const name = path.slice(path.lastIndexOf('/') + 1)
  switch (result.status) {
    case 'too-large':
      return {
        detail: `${name}, ${(result.sizeBytes / MEGABYTE).toFixed(1)} MB, is too large to show here.`,
        canOpen: canOpenCodeExtension(codeFileExtension(path))
      }
    case 'missing':
      return { detail: `${name} wasn't found.`, canOpen: false }
    case 'blocked':
      return { detail: `Ryte can't show ${name}.`, canOpen: false }
  }
}

/** A file size for the caption: bytes, then KB and MB with one decimal. */
export function formatCodeFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MEGABYTE) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / MEGABYTE).toFixed(1)} MB`
}
