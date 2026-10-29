import { readFile, stat } from 'node:fs/promises'
import { relative, sep } from 'node:path'

import type {
  MarkdownTaskFact,
  TaskFactsResponse,
  TaskListInput,
  TaskToggleInput,
  TaskToggleResponse
} from '../../shared/tasks'
import { walkNotes } from '../indexing/walker'
import { resolveSourcePathUnderRoot } from '../viewer/file-reader'
import { extractMarkdownTaskFacts, toggleMarkdownTask } from './task-extractor'
import { writeFileIfUnchanged } from './write-if-unchanged'

const TASK_FACTS_CONCURRENCY = 16
const DEFAULT_TASK_LIMIT = 50
const MAX_TASK_LIMIT = 200

interface TaskFactsSnapshot {
  notesRoot: string
  tasks: MarkdownTaskFact[]
  refreshedAt: string
}

function sourcePathFor(notesRoot: string, absolutePath: string): string {
  return relative(notesRoot, absolutePath).split(sep).join('/')
}

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<U>
): Promise<U[]> {
  const results: U[] = new Array(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index] as T)
    }
  }

  const workerCount = Math.min(concurrency, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

function compareTasks(left: MarkdownTaskFact, right: MarkdownTaskFact): number {
  const leftMtime = left.sourceMtimeMs ?? 0
  const rightMtime = right.sourceMtimeMs ?? 0
  if (leftMtime !== rightMtime) return rightMtime - leftMtime
  if (left.sourcePath !== right.sourcePath) return left.sourcePath.localeCompare(right.sourcePath)
  return left.line - right.line
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_TASK_LIMIT
  return Math.max(0, Math.min(MAX_TASK_LIMIT, Math.floor(limit)))
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function sourceLineAt(markdown: string, line: number): string | null {
  if (line < 1) return null

  let currentLine = 1
  let start = 0
  for (let index = 0; index < markdown.length; index += 1) {
    const char = markdown[index]
    if (char !== '\n' && char !== '\r') continue

    if (currentLine === line) return markdown.slice(start, index)
    if (char === '\r' && markdown[index + 1] === '\n') index += 1
    start = index + 1
    currentLine += 1
  }

  if (currentLine === line && start <= markdown.length) return markdown.slice(start)
  return null
}

export class TaskFactsService {
  private snapshot: TaskFactsSnapshot | null = null
  private stale = true
  private refreshPromise: Promise<TaskFactsSnapshot> | null = null

  markStale(): void {
    this.stale = true
  }

  async refresh(notesRoot: string): Promise<TaskFactsSnapshot> {
    if (this.refreshPromise) return this.refreshPromise

    this.refreshPromise = this.buildSnapshot(notesRoot)
      .then((snapshot) => {
        this.snapshot = snapshot
        this.stale = false
        return snapshot
      })
      .finally(() => {
        this.refreshPromise = null
      })

    return this.refreshPromise
  }

  async list(notesRoot: string, input: TaskListInput = {}): Promise<TaskFactsResponse> {
    if (!this.snapshot || this.snapshot.notesRoot !== notesRoot || this.stale) {
      await this.refresh(notesRoot)
    }

    const snapshot = this.snapshot
    if (!snapshot) {
      return { notesRoot, tasks: [], refreshedAt: new Date(0).toISOString() }
    }

    const limit = normalizeLimit(input.limit)
    const tasks = snapshot.tasks
      .filter((task) => input.checked === undefined || task.checked === input.checked)
      .slice(0, limit)

    return {
      notesRoot: snapshot.notesRoot,
      tasks,
      refreshedAt: snapshot.refreshedAt
    }
  }

  async toggle(notesRoot: string, input: TaskToggleInput): Promise<TaskToggleResponse> {
    let safePath: string
    try {
      safePath = await resolveSourcePathUnderRoot(input.sourcePath, notesRoot)
    } catch {
      return { ok: false, reason: 'invalid-source' }
    }

    try {
      // The mtime is taken before the text, so an edit in between leaves it older than the text
      // and the write below refuses; the other order could pair old text with a newer mtime.
      const metadata = await stat(safePath)
      const markdown = await readFile(safePath, 'utf-8')

      if (sourceLineAt(markdown, input.line) !== input.expectedLine) {
        return { ok: false, reason: 'source-line-changed' }
      }

      const extractedAt = new Date().toISOString()
      const currentTask = extractMarkdownTaskFacts({
        markdown,
        sourcePath: input.sourcePath,
        sourceMtimeMs: metadata.mtimeMs,
        extractedAt
      }).find((task) => task.line === input.line && task.checkboxColumn === input.checkboxColumn)

      if (!currentTask) return { ok: false, reason: 'checkbox-missing' }

      const result = toggleMarkdownTask({
        markdown,
        task: currentTask,
        checked: input.checked,
        extractedAt
      })
      if (!result.ok) return result

      // Only if the note still has the mtime it was read with, so an editor's save in between is
      // never overwritten with this stale copy.
      if (!(await writeFileIfUnchanged(safePath, metadata.mtimeMs, result.markdown))) {
        return { ok: false, reason: 'source-line-changed' }
      }
      const nextMetadata = await stat(safePath)
      this.markStale()
      return {
        ok: true,
        markdown: result.markdown,
        task: {
          ...result.task,
          sourceMtimeMs: nextMetadata.mtimeMs,
          extractedAt
        }
      }
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return { ok: false, reason: 'missing-file' }
      }
      throw error
    }
  }

  private async buildSnapshot(notesRoot: string): Promise<TaskFactsSnapshot> {
    const absolutePaths = await walkNotes(notesRoot)
    const extractedAt = new Date().toISOString()
    const taskLists = await mapWithConcurrency(
      absolutePaths,
      TASK_FACTS_CONCURRENCY,
      async (absolutePath) => {
        const [metadata, markdown] = await Promise.all([
          stat(absolutePath),
          readFile(absolutePath, 'utf-8')
        ])
        return extractMarkdownTaskFacts({
          markdown,
          sourcePath: sourcePathFor(notesRoot, absolutePath),
          sourceMtimeMs: metadata.mtimeMs,
          extractedAt
        })
      }
    )

    return {
      notesRoot,
      tasks: taskLists.flat().sort(compareTasks),
      refreshedAt: extractedAt
    }
  }
}

export const taskFactsService = new TaskFactsService()
