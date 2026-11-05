import { isAbsolute } from 'node:path'

import { z } from 'zod'

import {
  MAX_PATH_LENGTH,
  normalizeWorkspaceExternalPath,
  normalizeWorkspaceSourcePath
} from '../shared/source-path'

/**
 * A notes-root-relative file path, validated and normalized by the same function the legacy IPC
 * validators use (relative only, no traversal, no NUL, length-bounded).
 */
export const sourcePath = z.string().transform((value, ctx) => {
  try {
    return normalizeWorkspaceSourcePath(value)
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid source path' })
    return z.NEVER
  }
})

/**
 * An absolute Markdown file path outside the notes root, validated and normalized by the same function the
 * legacy IPC validators use.
 */
export const externalPath = z.string().transform((value, ctx) => {
  try {
    return normalizeWorkspaceExternalPath(value)
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid external path' })
    return z.NEVER
  }
})

/**
 * A reference to a note file: exactly one of `sourcePath` (inside the notes root) or `externalPath`. The
 * other key may be absent or `undefined`, as the legacy validator counted an `undefined` key as absent, so
 * this is deliberately not covered by `hasNoExplicitUndefined`.
 */
export const workspaceFileRef = z.union([
  z.strictObject({ sourcePath, externalPath: z.undefined().optional() }),
  z.strictObject({ externalPath, sourcePath: z.undefined().optional() })
])

/** The one definition of a tab id's shape. */
export const WORKSPACE_TAB_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,199}$/

/**
 * The id of an open tab: 1 to 200 characters of letters, digits and `: _ . -`, starting with a letter or digit.
 * The expression is anchored at both ends, so a trailing newline is not allowed.
 */
export const workspaceTabId = z
  .string()
  .refine((value) => WORKSPACE_TAB_ID_RE.test(value), 'Expected a tab id')

/**
 * A note inside the notes root, as a `sourcePath` only. The other file-reference key is declared (as `undefined`) so
 * the type equals the file-reference type this replaced, and an own `externalPath` key is rejected even when it is
 * `undefined`.
 */
export const sourceFileInput = z
  .strictObject({ sourcePath, externalPath: z.undefined().optional() })
  .refine(hasNoExplicitUndefined, 'Expected defined values')

type FileRefInput =
  | { sourcePath: string; externalPath?: undefined }
  | { externalPath: string; sourcePath?: undefined }

/**
 * A file reference that keeps only the key that was set, as the validator this replaced did, so no `undefined` key
 * reaches the store. Same acceptance rules as `workspaceFileRef`.
 */
export const workspaceFileRefInput = workspaceFileRef.transform(
  (file): FileRefInput =>
    file.sourcePath !== undefined
      ? { sourcePath: file.sourcePath }
      : { externalPath: file.externalPath }
)

/**
 * An integer by `Number.isInteger`, matching the legacy validators. `z.int()` is narrower: it rejects
 * integers outside the safe range that `Number.isInteger` accepts.
 */
export const integer = z.number().refine(Number.isInteger, 'Expected an integer')

/**
 * Rejects an object that carries a key whose value is explicitly `undefined`. The legacy validators
 * treated a present key as supplied (`'limit' in input`), so `{ limit: undefined }` was an error even
 * though the key is optional.
 */
export function hasNoExplicitUndefined(value: Record<string, unknown>): boolean {
  return Object.values(value).every((entry) => entry !== undefined)
}

const MAX_SEARCH_QUERY_LENGTH = 2000

/**
 * A search query: trimmed, then 1 to 2000 characters. The length counts the trimmed text, so padding does not use
 * up the limit, and the handler receives the trimmed value.
 */
export const searchQuery = z.string().transform((value, ctx) => {
  const query = value.trim()
  if (query.length === 0 || query.length > MAX_SEARCH_QUERY_LENGTH) {
    ctx.addIssue({ code: 'custom', message: 'Invalid search query' })
    return z.NEVER
  }
  return query
})

/**
 * An absolute path by `node:path`, non-empty and at most `MAX_PATH_LENGTH`, kept exactly as given (the legacy
 * validator did not normalize it).
 */
export const absolutePath = z
  .string()
  .refine(
    (value) => value.length > 0 && value.length <= MAX_PATH_LENGTH && isAbsolute(value),
    'Expected an absolute path'
  )
