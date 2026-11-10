import { extname } from 'node:path'

import { z } from 'zod'

import { defineArea, defineEvent, defineOperation } from './define'
import {
  externalPath,
  sourceFileInput,
  sourcePath,
  workspaceFileRefInput,
  workspaceTabId
} from './primitives'
import { exampleState, storedFileRef, workspaceState } from './workspace'

const MAX_FILE_NAME_LENGTH = 255

/**
 * A file name for a rename: 1 to 255 characters, not `.` or `..`, no slash, backslash or NUL, and a `.md`
 * extension in any case. `extname` decides, so a hidden file named `.md` has no extension and is refused.
 */
const fileName = z
  .string()
  .refine(
    (value) =>
      value.length > 0 &&
      value.length <= MAX_FILE_NAME_LENGTH &&
      value !== '.' &&
      value !== '..' &&
      !value.includes('/') &&
      !value.includes('\\') &&
      !value.includes('\0') &&
      extname(value).toLowerCase() === '.md',
    'Expected a Markdown file name'
  )

type RenameInput =
  | { sourcePath: string; externalPath?: undefined; name: string }
  | { externalPath: string; sourcePath?: undefined; name: string }

/**
 * A file reference (exactly one of the two paths; an explicit `undefined` counts as absent, as before) plus the
 * new name. Keeps only the key that was set, so no `undefined` key reaches the store.
 */
const renameInput = z
  .union([
    z.strictObject({ sourcePath, externalPath: z.undefined().optional(), name: fileName }),
    z.strictObject({ externalPath, sourcePath: z.undefined().optional(), name: fileName })
  ])
  .transform(
    (input): RenameInput =>
      input.sourcePath !== undefined
        ? { sourcePath: input.sourcePath, name: input.name }
        : { externalPath: input.externalPath, name: input.name }
  )

const tabFileInput = z.strictObject({ tabId: workspaceTabId })

// What the main process returns. Nothing parses a response at runtime, so these describe what the handlers can
// return rather than guard it.
const fileTreeResponse = z.object({
  notesRoot: z.string(),
  // Relative to `notesRoot`, sorted.
  paths: z.array(z.string())
})

const fileCatalogEntry = z.object({
  sourcePath: z.string(),
  title: z.string(),
  directory: z.string(),
  searchableText: z.string(),
  pathDate: z.string().nullable(),
  modifiedAt: z.string(),
  modifiedAtMs: z.number(),
  // null when the file system does not report a creation time.
  createdAt: z.string().nullable(),
  createdAtMs: z.number().nullable(),
  sizeBytes: z.number()
})

const fileCatalogResponse = z.object({
  notesRoot: z.string(),
  files: z.array(fileCatalogEntry)
})

// One change to the catalog. An absent payload means "refresh everything" (a rapid rename or delete made the
// file unreadable before it could be described), so the event's payload is optional on purpose.
const fileCatalogChange = z.discriminatedUnion('type', [
  z.object({ type: z.literal('upsert'), file: fileCatalogEntry }),
  z.object({ type: z.literal('remove'), sourcePath: z.string() })
])

const fileRenameResult = z.object({ file: storedFileRef, workspace: workspaceState })

const fileTrashResult = z.object({ trashed: z.boolean(), workspace: workspaceState })

export const listTree = defineOperation({
  channel: 'files:list-tree',
  description:
    'Every note and supported picture under the notes folder as a path relative to it, sorted, with the notes folder.',
  input: z.undefined(),
  output: fileTreeResponse,
  example: {
    input: undefined,
    output: { notesRoot: '/Users/example/Notes', paths: ['ideas/plan.md', 'journal/2026-01-01.md'] }
  }
})

export const listCatalog = defineOperation({
  channel: 'files:list-catalog',
  description:
    "Every note and supported picture under the notes folder with its title, folder, dates and size, sorted by path. A picture's title is its file name.",
  input: z.undefined(),
  output: fileCatalogResponse,
  example: {
    input: undefined,
    output: {
      notesRoot: '/Users/example/Notes',
      files: [
        {
          sourcePath: 'ideas/plan.md',
          title: 'Plan',
          directory: 'ideas',
          searchableText: 'plan ideas ideas/plan.md',
          pathDate: null,
          modifiedAt: '2026-01-02T00:00:00.000Z',
          modifiedAtMs: 1767312000000,
          createdAt: '2026-01-01T00:00:00.000Z',
          createdAtMs: 1767225600000,
          sizeBytes: 120
        }
      ]
    }
  }
})

export const readSourceTitle = defineOperation({
  channel: 'files:read-source-title',
  description:
    'The title of a note in the notes folder, or null when it has none. Fails when the path is outside the notes folder.',
  input: sourceFileInput,
  output: z.string().nullable(),
  example: { input: { sourcePath: 'ideas/plan.md' }, output: 'Plan' }
})

export const readWorkspaceTab = defineOperation({
  channel: 'files:read-workspace-tab',
  description:
    'The text of the file an open tab shows. A note must be inside the notes folder; a file opened from outside it is read as is. Fails when no tab has that id.',
  input: tabFileInput,
  output: z.string(),
  example: {
    input: { tabId: 'c0a8b6de-1f2e-4c3d-9a4b-5e6f7a8b9c0d' },
    output: '# Plan\n'
  }
})

export const copyContent = defineOperation({
  channel: 'files:copy-content',
  description: 'Put the text of a file on the clipboard.',
  input: workspaceFileRefInput,
  output: z.void(),
  example: { input: { sourcePath: 'ideas/plan.md' }, output: undefined }
})

export const copyPath = defineOperation({
  channel: 'files:copy-path',
  description: 'Put the full path of a file on the clipboard.',
  input: workspaceFileRefInput,
  output: z.void(),
  example: { input: { sourcePath: 'ideas/plan.md' }, output: undefined }
})

export const showInFinder = defineOperation({
  channel: 'files:show-in-finder',
  description: 'Reveal a file in Finder.',
  input: workspaceFileRefInput,
  output: z.void(),
  example: { input: { externalPath: '/tmp/outside/plan.md' }, output: undefined }
})

export const rename = defineOperation({
  channel: 'files:rename',
  description:
    'Rename a file in its folder. The name must end in `.md`. Updates the open tabs and recent files, and refreshes the app menu.',
  input: renameInput,
  output: fileRenameResult,
  example: {
    input: { sourcePath: 'ideas/plan.md', name: 'roadmap.md' },
    output: { file: { sourcePath: 'ideas/roadmap.md' }, workspace: exampleState }
  }
})

export const moveToTrash = defineOperation({
  channel: 'files:move-to-trash',
  description:
    'Ask the person to confirm over the window that asked, then move a file to the Trash and drop it from the open tabs and recent files. Returns `trashed: false` and the workspace unchanged when they decline. Refreshes the app menu after a move.',
  input: workspaceFileRefInput,
  output: fileTrashResult,
  example: {
    input: { sourcePath: 'ideas/plan.md' },
    output: { trashed: true, workspace: { ...exampleState, tabs: [], activeTabId: null } }
  }
})

export const watchWorkspaceTab = defineOperation({
  channel: 'files:watch-workspace-tab',
  description:
    'Watch the file an open tab shows, in place of whatever was watched before (one file at a time, for the whole app). A note must be inside the notes folder. Changes arrive as `sourceChange` and `workspaceTabChange` events. Fails when no tab has that id.',
  input: tabFileInput,
  output: z.void(),
  example: { input: { tabId: 'c0a8b6de-1f2e-4c3d-9a4b-5e6f7a8b9c0d' }, output: undefined }
})

export const unwatch = defineOperation({
  channel: 'files:unwatch',
  description: 'Stop watching the file that was being watched, if any.',
  input: z.undefined(),
  output: z.void(),
  example: { input: undefined, output: undefined }
})

export const treeChanged = defineEvent({
  channel: 'files:tree-changed',
  description:
    'A note or supported picture was added, removed or renamed under the notes folder. Sent to every window.'
})

export const catalogChanged = defineEvent({
  channel: 'files:catalog-changed',
  description:
    'One file under the notes folder changed: its new catalog entry (`upsert`) or its path (`remove`). The payload is absent when the change could not be described, which means refresh the whole catalog. Sent to every window.',
  payload: fileCatalogChange.optional()
})

// The keys are `sourceChange` and `workspaceTabChange` so the renderer-facing subscribers keep the names they had on
// `window.ryte.files` (`onSourceChange`, `onWorkspaceTabChange`), although the wire channels start with `viewer:`.
export const sourceChange = defineEvent({
  channel: 'viewer:source-changed',
  description:
    'The watched file changed on disk. Carries its notes-relative path. Sent to every window, and only when the path can be told.',
  payload: z.string()
})

export const workspaceTabChange = defineEvent({
  channel: 'viewer:workspace-tab-changed',
  description:
    'The file of the watched tab changed on disk. Carries the id of the tab. Sent to every window, after `sourceChange`.',
  payload: workspaceTabId
})

export const files = defineArea('files', {
  operations: {
    listTree,
    listCatalog,
    readSourceTitle,
    readWorkspaceTab,
    copyContent,
    copyPath,
    showInFinder,
    rename,
    moveToTrash,
    watchWorkspaceTab,
    unwatch
  },
  events: { treeChanged, catalogChanged, sourceChange, workspaceTabChange }
})

export type FileTreeResponse = z.output<typeof fileTreeResponse>
export type FileCatalogEntry = z.output<typeof fileCatalogEntry>
export type FileCatalogResponse = z.output<typeof fileCatalogResponse>
export type FileCatalogChange = z.output<typeof fileCatalogChange>
export type FileRenameInput = z.output<typeof renameInput>
export type FileRenameResult = z.output<typeof fileRenameResult>
export type FileTrashResult = z.output<typeof fileTrashResult>
export type FilesWorkspaceTabInput = z.output<typeof tabFileInput>
