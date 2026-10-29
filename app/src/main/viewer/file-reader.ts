import { readFile, realpath } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

import { readMarkdownTitleFromFile } from './markdown-title-reader'

export async function resolveAndAssertUnderRoot(
  absPath: string,
  notesRoot: string
): Promise<string> {
  const resolvedRoot = await realpath(resolve(notesRoot))

  let resolvedTarget: string
  try {
    resolvedTarget = await realpath(resolve(absPath))
  } catch {
    resolvedTarget = resolve(absPath)
  }

  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + sep)) {
    throw new Error(`path outside notes root: ${absPath}`)
  }

  return resolvedTarget
}

export async function readFileSafe(absPath: string, notesRoot: string): Promise<string> {
  const safePath = await resolveAndAssertUnderRoot(absPath, notesRoot)
  return readFile(safePath, 'utf8')
}

export async function resolveSourcePathUnderRoot(
  sourcePath: string,
  notesRoot: string
): Promise<string> {
  return resolveAndAssertUnderRoot(resolve(notesRoot, sourcePath), notesRoot)
}

export async function readSourceFileSafe(sourcePath: string, notesRoot: string): Promise<string> {
  const safePath = await resolveSourcePathUnderRoot(sourcePath, notesRoot)
  return readFile(safePath, 'utf8')
}

export async function readSourceTitleSafe(
  sourcePath: string,
  notesRoot: string
): Promise<string | null> {
  const safePath = await resolveSourcePathUnderRoot(sourcePath, notesRoot)
  return readMarkdownTitleFromFile(safePath)
}
