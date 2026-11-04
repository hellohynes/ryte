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
