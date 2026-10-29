import { createHash } from 'node:crypto'

import type { MarkdownTaskFact } from '../../shared/tasks'

const ATX_HEADING_RE = /^( {0,3})(#{1,6})\s+(.+?)\s*#*\s*$/
const FENCE_RE = /^( {0,3})(`{3,}|~{3,})/
const TASK_RE = /^(\s*(?:[-+*]|\d+[.)])\s+)\[( |x|X)\](\s+.*?|\s*)$/
const FRONTMATTER_DELIMITER_RE = /^(---|\.\.\.)\s*$/

export interface ExtractMarkdownTaskFactsInput {
  markdown: string
  sourcePath: string
  sourceMtimeMs?: number | null
  extractedAt?: string
}

export interface ToggleMarkdownTaskInput {
  markdown: string
  task: MarkdownTaskFact
  checked?: boolean
  extractedAt?: string
}

export type ToggleMarkdownTaskResult =
  | {
      ok: true
      markdown: string
      task: MarkdownTaskFact
    }
  | {
      ok: false
      reason:
        | 'line-missing'
        | 'checkbox-missing'
        | 'task-text-changed'
        | 'fingerprint-mismatch'
        | 'source-path-mismatch'
    }

interface SourceLine {
  text: string
  ending: string
}

interface Heading {
  level: number
  title: string
}

export function extractMarkdownTaskFacts({
  markdown,
  sourcePath,
  sourceMtimeMs = null,
  extractedAt = new Date().toISOString()
}: ExtractMarkdownTaskFactsInput): MarkdownTaskFact[] {
  const lines = splitLines(markdown)
  const tasks: Array<Omit<MarkdownTaskFact, 'id' | 'occurrenceIndex' | 'fingerprint'>> = []
  const headingStack: Heading[] = []
  let inFrontmatter = startsWithFrontmatter(lines)
  let inFence = false
  let fenceMarker: string | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]?.text ?? ''
    const line = index + 1

    if (inFrontmatter) {
      if (index > 0 && FRONTMATTER_DELIMITER_RE.test(rawLine.trim())) {
        inFrontmatter = false
      }
      continue
    }

    const fence = FENCE_RE.exec(rawLine)
    if (fence) {
      const marker = fence[2]![0]!
      if (!inFence) {
        inFence = true
        fenceMarker = marker
      } else if (fenceMarker === marker) {
        inFence = false
        fenceMarker = null
      }
      continue
    }

    if (inFence) continue

    const heading = ATX_HEADING_RE.exec(rawLine)
    if (heading) {
      const level = heading[2]!.length
      const title = normalizeHeadingText(heading[3]!)
      while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= level) {
        headingStack.pop()
      }
      headingStack.push({ level, title })
      continue
    }

    const task = TASK_RE.exec(rawLine)
    if (!task) continue

    const markerPrefix = task[1]!
    const marker = task[2]!
    const checkboxColumn = markerPrefix.length
    const normalizedText = normalizeTaskText(task[3] ?? '')
    tasks.push({
      sourcePath,
      line,
      checkboxColumn,
      checked: marker.toLowerCase() === 'x',
      rawLine,
      normalizedText,
      headingPath: headingStack.map(({ title }) => title),
      sourceMtimeMs,
      extractedAt
    })
  }

  const occurrenceCounts = new Map<string, number>()
  return tasks.map((task) => {
    const occurrenceKey = taskIdentityKey(task)
    const occurrenceIndex = occurrenceCounts.get(occurrenceKey) ?? 0
    occurrenceCounts.set(occurrenceKey, occurrenceIndex + 1)
    const fingerprint = taskFingerprint({ ...task, occurrenceIndex })
    return {
      ...task,
      occurrenceIndex,
      fingerprint,
      id: fingerprint
    }
  })
}

export function toggleMarkdownTask({
  markdown,
  task,
  checked = !task.checked,
  extractedAt = new Date().toISOString()
}: ToggleMarkdownTaskInput): ToggleMarkdownTaskResult {
  if (!task.sourcePath) return { ok: false, reason: 'source-path-mismatch' }

  const lines = splitLines(markdown)
  const targetLine = lines[task.line - 1]
  if (!targetLine) return { ok: false, reason: 'line-missing' }

  const marker = targetLine.text.slice(task.checkboxColumn, task.checkboxColumn + 3)
  if (marker !== '[ ]' && marker !== '[x]' && marker !== '[X]') {
    return { ok: false, reason: 'checkbox-missing' }
  }

  const currentFacts = extractMarkdownTaskFacts({
    markdown,
    sourcePath: task.sourcePath,
    sourceMtimeMs: task.sourceMtimeMs,
    extractedAt
  })
  const currentFact = currentFacts.find(
    (candidate) => candidate.line === task.line && candidate.checkboxColumn === task.checkboxColumn
  )

  if (!currentFact) return { ok: false, reason: 'checkbox-missing' }
  if (currentFact.normalizedText !== task.normalizedText) {
    return { ok: false, reason: 'task-text-changed' }
  }
  if (currentFact.fingerprint !== task.fingerprint) {
    return { ok: false, reason: 'fingerprint-mismatch' }
  }

  const replacement = checked ? '[x]' : '[ ]'
  lines[task.line - 1] = {
    ...targetLine,
    text:
      targetLine.text.slice(0, task.checkboxColumn) +
      replacement +
      targetLine.text.slice(task.checkboxColumn + 3)
  }

  const nextMarkdown = joinLines(lines)
  const [nextTask] = extractMarkdownTaskFacts({
    markdown: nextMarkdown,
    sourcePath: task.sourcePath,
    sourceMtimeMs: task.sourceMtimeMs,
    extractedAt
  }).filter(
    (candidate) =>
      candidate.line === task.line &&
      candidate.checkboxColumn === task.checkboxColumn &&
      candidate.fingerprint === task.fingerprint
  )

  if (!nextTask) return { ok: false, reason: 'fingerprint-mismatch' }
  return { ok: true, markdown: nextMarkdown, task: nextTask }
}

function splitLines(markdown: string): SourceLine[] {
  if (markdown.length === 0) return []

  const lines: SourceLine[] = []
  let start = 0
  for (let i = 0; i < markdown.length; i += 1) {
    const char = markdown[i]
    if (char !== '\n' && char !== '\r') continue

    let ending = char
    if (char === '\r' && markdown[i + 1] === '\n') {
      ending = '\r\n'
      i += 1
    }
    lines.push({ text: markdown.slice(start, i + 1 - ending.length), ending })
    start = i + 1
  }

  if (start < markdown.length) {
    lines.push({ text: markdown.slice(start), ending: '' })
  }

  return lines
}

function joinLines(lines: SourceLine[]): string {
  return lines.map(({ text, ending }) => text + ending).join('')
}

function startsWithFrontmatter(lines: SourceLine[]): boolean {
  return lines[0]?.text.trim() === '---'
}

function normalizeHeadingText(value: string): string {
  return value
    .replace(/\s+#+\s*$/, '')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeTaskText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function taskIdentityKey(
  task: Pick<MarkdownTaskFact, 'sourcePath' | 'headingPath' | 'normalizedText'>
): string {
  return [task.sourcePath, task.headingPath.join('\u001f'), task.normalizedText].join('\u001e')
}

function taskFingerprint(
  task: Pick<MarkdownTaskFact, 'sourcePath' | 'headingPath' | 'normalizedText' | 'occurrenceIndex'>
): string {
  return createHash('sha256')
    .update('ryte-task-v1')
    .update('\0')
    .update(task.sourcePath)
    .update('\0')
    .update(task.headingPath.join('\u001f'))
    .update('\0')
    .update(task.normalizedText)
    .update('\0')
    .update(String(task.occurrenceIndex))
    .digest('hex')
}
