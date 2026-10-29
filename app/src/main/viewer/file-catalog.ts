import { stat } from 'node:fs/promises'
import { basename, dirname, relative, sep } from 'node:path'

import type { FileCatalogEntry, FileCatalogResponse } from '../../shared/files'
import { walkNotes } from '../indexing/walker'
import { readMarkdownTitleFromFile } from './markdown-title-reader'

const SOURCE_DATE_RE = /\d{4}-\d{2}-\d{2}/g
const CATALOG_ENTRY_CONCURRENCY = 32

function sourcePathFor(notesRoot: string, absolutePath: string): string {
  return relative(notesRoot, absolutePath).split(sep).join('/')
}

function titleFromSourcePath(sourcePath: string): string {
  const fileName = basename(sourcePath)
  return fileName.toLowerCase().endsWith('.md') ? fileName.slice(0, -3) : fileName
}

function directoryFromSourcePath(sourcePath: string): string {
  const dir = dirname(sourcePath).split(sep).join('/')
  return dir === '.' ? '' : dir
}

function pathDateFromSourcePath(sourcePath: string): string | null {
  const matches = sourcePath.match(SOURCE_DATE_RE)
  return matches?.at(-1) ?? null
}

function nullableDate(ms: number): string | null {
  if (!Number.isFinite(ms) || ms <= 0) return null
  return new Date(ms).toISOString()
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

/** Build one safe catalog entry for a markdown file below the configured notes root. */
export async function fileCatalogEntryFor(
  notesRoot: string,
  absolutePath: string
): Promise<FileCatalogEntry> {
  const [metadata, documentTitle] = await Promise.all([
    stat(absolutePath),
    readMarkdownTitleFromFile(absolutePath)
  ])
  const sourcePath = sourcePathFor(notesRoot, absolutePath)
  const fallbackTitle = titleFromSourcePath(sourcePath)
  const title = documentTitle ?? fallbackTitle
  const directory = directoryFromSourcePath(sourcePath)

  return {
    sourcePath,
    title,
    directory,
    searchableText: [title, directory, sourcePath].filter(Boolean).join(' ').toLowerCase(),
    pathDate: pathDateFromSourcePath(sourcePath),
    modifiedAt: metadata.mtime.toISOString(),
    modifiedAtMs: metadata.mtimeMs,
    createdAt: nullableDate(metadata.birthtimeMs),
    createdAtMs: metadata.birthtimeMs > 0 ? metadata.birthtimeMs : null,
    sizeBytes: metadata.size
  }
}

export async function listFileCatalog(notesRoot: string): Promise<FileCatalogResponse> {
  const absolutePaths = await walkNotes(notesRoot)
  const files = await mapWithConcurrency(absolutePaths, CATALOG_ENTRY_CONCURRENCY, (absolutePath) =>
    fileCatalogEntryFor(notesRoot, absolutePath)
  )

  files.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath))
  return { notesRoot, files }
}
