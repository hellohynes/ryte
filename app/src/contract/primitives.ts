import { isAbsolute } from 'node:path'

import { z } from 'zod'

import { MAX_PATH_LENGTH, normalizeWorkspaceSourcePath } from '../shared/source-path'

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
