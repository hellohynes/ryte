import { sep } from 'node:path'

import { z } from 'zod'

import { normalizeWorkspaceSourcePath } from '../shared/source-path'
import { WORKSPACE_SCHEMA_VERSION } from '../shared/workspace'
import { defineArea, defineOperation } from './define'
import {
  hasNoExplicitUndefined,
  sourceFileInput,
  sourcePath,
  workspaceFileRefInput,
  workspaceTabId
} from './primitives'

const MAX_SIDEBAR_WIDTH = 4000
const MAX_DOCUMENT_OUTLINE_WIDTH = 1000

const viewMode = z.enum(['preview', 'source'])
const sidebarMode = z.literal('files')
const folderSortMode = z.enum(['az', 'za', 'recency'])

/**
 * A top-level folder of the notes root: a source path with no separator. Used as the key of the sort-mode map,
 * and kept exactly as normalized, so `./docs` and `docs` are one folder.
 */
function normalizeTopLevelFolder(value: string): string | null {
  try {
    const folder = normalizeWorkspaceSourcePath(value)
    return folder.includes(sep) || folder.includes('/') ? null : folder
  } catch {
    return null
  }
}

/**
 * The sort mode of each top-level folder. Keys are normalized like source paths; when two keys name the same
 * folder the later one wins. Written as a check plus a transform, not `z.record`, because Zod's record skips an
 * own `__proto__` key where the validator this replaced rejected its value, so a record would accept more.
 */
const folderSortModesInput = z
  .custom<Record<string, z.output<typeof folderSortMode>>>(
    (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
    'Expected a folder map'
  )
  .meta({ type: 'object' })
  .transform((modes, ctx): Record<string, z.output<typeof folderSortMode>> => {
    const normalized: Record<string, z.output<typeof folderSortMode>> = {}
    for (const [folder, mode] of Object.entries(modes)) {
      const key = normalizeTopLevelFolder(folder)
      if (key === null || !folderSortMode.safeParse(mode).success) {
        // No path or value in the issue: a folder name is note data, and errors never carry values.
        ctx.addIssue({ code: 'custom', message: 'Invalid top-level folder sort mode' })
        return z.NEVER
      }
      normalized[key] = mode
    }
    return normalized
  })

// What the main process stores. The output schemas are documentation and types: nothing parses a response at
// runtime, so they describe what the store can return rather than guard it.
const windowBounds = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number()
})

/** One note file: exactly one of `sourcePath` or `externalPath`. */
export const storedFileRef = z.union([
  z.object({ sourcePath: z.string(), externalPath: z.undefined().optional() }),
  z.object({ externalPath: z.string(), sourcePath: z.undefined().optional() })
])

const workspaceFileTab = z.intersection(
  storedFileRef,
  z.object({ id: z.string(), title: z.string(), viewMode })
)

/** A tab for a local address: no file, only the address. */
const workspaceAddressTab = z.object({
  id: z.string(),
  title: z.string(),
  viewMode,
  url: z.string(),
  sourcePath: z.undefined().optional(),
  externalPath: z.undefined().optional()
})

const workspaceTab = z.union([workspaceFileTab, workspaceAddressTab])

const recentFile = z.intersection(
  storedFileRef,
  z.object({ title: z.string(), openedAt: z.string() })
)

/** Everything the app remembers about the window, tabs and sidebar between launches. */
export const workspaceState = z.object({
  schemaVersion: z.literal(WORKSPACE_SCHEMA_VERSION),
  shell: z.object({
    sidebarCollapsed: z.boolean(),
    sidebarWidth: z.number(),
    activeSidebar: sidebarMode
  }),
  library: z.object({
    // null until the person has expanded or collapsed a folder.
    expandedFolders: z.array(z.string()).nullable(),
    scrollTop: z.number(),
    folderSortModes: z.record(z.string(), folderSortMode)
  }),
  window: z.object({
    bounds: windowBounds.nullable(),
    maximized: z.boolean(),
    fullscreen: z.boolean()
  }),
  tabs: z.array(workspaceTab),
  activeTabId: z.string().nullable(),
  recents: z.array(recentFile),
  outlineWidth: z.number(),
  outlineCollapsedByPath: z.record(z.string(), z.boolean())
})

export const exampleState = {
  schemaVersion: WORKSPACE_SCHEMA_VERSION as typeof WORKSPACE_SCHEMA_VERSION,
  shell: { sidebarCollapsed: false, sidebarWidth: 360, activeSidebar: 'files' as const },
  library: { expandedFolders: null, scrollTop: 0, folderSortModes: {} },
  window: { bounds: null, maximized: false, fullscreen: false },
  tabs: [
    {
      id: 'c0a8b6de-1f2e-4c3d-9a4b-5e6f7a8b9c0d',
      sourcePath: 'ideas/plan.md',
      title: 'plan.md',
      viewMode: 'preview' as const
    }
  ],
  activeTabId: 'c0a8b6de-1f2e-4c3d-9a4b-5e6f7a8b9c0d',
  recents: [
    { sourcePath: 'ideas/plan.md', title: 'plan.md', openedAt: '2026-01-01T00:00:00.000Z' }
  ],
  outlineWidth: 216,
  outlineCollapsedByPath: {}
}

const shellPatch = z
  .strictObject({
    sidebarCollapsed: z.boolean().optional(),
    sidebarWidth: z.number().positive().max(MAX_SIDEBAR_WIDTH).optional(),
    activeSidebar: sidebarMode.optional()
  })
  .refine(hasNoExplicitUndefined, 'Expected defined values')

const libraryPatch = z
  .strictObject({
    expandedFolders: z.array(sourcePath).optional(),
    scrollTop: z.number().min(0).optional(),
    folderSortModes: folderSortModesInput.optional()
  })
  .refine(hasNoExplicitUndefined, 'Expected defined values')

const tabInput = z.strictObject({ tabId: workspaceTabId })

const recordRecentInput = z.strictObject({ sourcePath })

const recentFileInput = workspaceFileRefInput

export const getState = defineOperation({
  channel: 'workspace:get-state',
  description:
    'The stored workspace: open tabs, recent files, sidebar, library and outline settings.',
  input: z.undefined(),
  output: workspaceState,
  example: { input: undefined, output: exampleState }
})

export const updateShell = defineOperation({
  channel: 'workspace:update-shell',
  description:
    'Change the sidebar: collapsed, width (above 0, up to 4000) or which panel is active.',
  input: shellPatch,
  output: workspaceState,
  example: {
    input: { sidebarCollapsed: true, sidebarWidth: 280 },
    output: {
      ...exampleState,
      shell: { ...exampleState.shell, sidebarCollapsed: true, sidebarWidth: 280 }
    }
  }
})

export const updateLibrary = defineOperation({
  channel: 'workspace:update-library',
  description:
    'Change the file library: expanded folders, scroll position or per-folder sort mode.',
  input: libraryPatch,
  output: workspaceState,
  example: {
    input: { expandedFolders: ['ideas'], scrollTop: 120, folderSortModes: { ideas: 'recency' } },
    output: {
      ...exampleState,
      library: { expandedFolders: ['ideas'], scrollTop: 120, folderSortModes: { ideas: 'recency' } }
    }
  }
})

export const focusTab = defineOperation({
  channel: 'workspace:focus-tab',
  description: 'Make an open tab the active one. Fails when no tab has that id.',
  input: tabInput,
  output: workspaceState,
  example: { input: { tabId: exampleState.activeTabId }, output: exampleState }
})

export const closeTab = defineOperation({
  channel: 'workspace:close-tab',
  description: 'Close an open tab and activate its neighbour. Fails when no tab has that id.',
  input: tabInput,
  output: workspaceState,
  example: {
    input: { tabId: exampleState.activeTabId },
    output: { ...exampleState, tabs: [], activeTabId: null }
  }
})

export const updateTabViewMode = defineOperation({
  channel: 'workspace:update-tab-view-mode',
  description:
    'Show an open tab as the rendered preview or as source. Fails when no tab has that id.',
  input: z.strictObject({ tabId: workspaceTabId, viewMode }),
  output: workspaceState,
  example: {
    input: { tabId: exampleState.activeTabId, viewMode: 'source' },
    output: { ...exampleState, tabs: [{ ...exampleState.tabs[0]!, viewMode: 'source' as const }] }
  }
})

export const setOutlineCollapsed = defineOperation({
  channel: 'workspace:set-outline-collapsed',
  description: 'Remember whether the outline of one note is collapsed.',
  input: z.strictObject({ sourcePath, collapsed: z.boolean() }),
  output: workspaceState,
  example: {
    input: { sourcePath: 'ideas/plan.md', collapsed: true },
    output: { ...exampleState, outlineCollapsedByPath: { 'ideas/plan.md': true } }
  }
})

export const setOutlineWidth = defineOperation({
  channel: 'workspace:set-outline-width',
  description:
    'Set the width of the document outline (above 0, up to 1000); the store clamps it to its limits.',
  input: z.strictObject({ width: z.number().positive().max(MAX_DOCUMENT_OUTLINE_WIDTH) }),
  output: workspaceState,
  example: { input: { width: 240 }, output: { ...exampleState, outlineWidth: 240 } }
})

export const openFile = defineOperation({
  channel: 'workspace:open-file',
  description:
    'Open a note from the notes folder in a new tab and add it to the recent files. Takes a `sourcePath` only. Fails when the file does not exist. Refreshes the app menu.',
  input: sourceFileInput,
  output: workspaceState,
  example: { input: { sourcePath: 'ideas/plan.md' }, output: exampleState }
})

export const openRecentFile = defineOperation({
  channel: 'workspace:open-recent-file',
  description:
    'Open a file from the recent files, inside the notes folder (`sourcePath`) or outside it (`externalPath`, never both), focusing its tab when it is open. Fails when the file is not a recent one or no longer exists. Refreshes the app menu.',
  input: recentFileInput,
  output: workspaceState,
  example: { input: { externalPath: '/tmp/outside/plan.md' }, output: exampleState }
})

export const openNativeFile = defineOperation({
  channel: 'workspace:open-native-file',
  description:
    'Ask the person to pick a Markdown file and open it in a tab, focusing its tab when it is open. Returns the workspace unchanged when the picker is cancelled; fails when the file is not a Markdown file. Refreshes the app menu unless cancelled.',
  input: z.undefined(),
  output: workspaceState,
  example: { input: undefined, output: exampleState }
})

export const recordRecent = defineOperation({
  channel: 'workspace:record-recent',
  description:
    'Put an existing note at the top of the recent files. Fails when the file does not exist. Refreshes the app menu.',
  input: recordRecentInput,
  output: workspaceState,
  example: { input: { sourcePath: 'ideas/plan.md' }, output: exampleState }
})

export const pruneMissingFileRefs = defineOperation({
  channel: 'workspace:prune-missing-file-refs',
  description:
    'Drop open tabs, recent files and outline settings of files that no longer exist. Refreshes the app menu.',
  input: z.undefined(),
  output: workspaceState,
  example: { input: undefined, output: exampleState }
})

export const workspace = defineArea('workspace', {
  operations: {
    getState,
    updateShell,
    updateLibrary,
    focusTab,
    closeTab,
    updateTabViewMode,
    setOutlineCollapsed,
    setOutlineWidth,
    openFile,
    openRecentFile,
    openNativeFile,
    recordRecent,
    pruneMissingFileRefs
  },
  events: {}
})

export type WorkspaceViewMode = z.output<typeof viewMode>
export type WorkspaceSidebarMode = z.output<typeof sidebarMode>
export type WorkspaceFolderSortMode = z.output<typeof folderSortMode>
export type WorkspaceState = z.output<typeof workspaceState>
export type WorkspaceShellUpdate = z.output<typeof shellPatch>
export type WorkspaceLibraryUpdate = z.output<typeof libraryPatch>
export type WorkspaceOpenFileInput = z.output<typeof sourceFileInput>
export type WorkspaceOpenRecentFileInput = z.output<typeof recentFileInput>
export type WorkspaceRecordRecentInput = z.output<typeof recordRecentInput>
export type WorkspaceFocusTabInput = z.output<typeof tabInput>
export type WorkspaceCloseTabInput = z.output<typeof tabInput>
export type WorkspaceUpdateTabViewModeInput = z.output<typeof updateTabViewMode.input>
export type WorkspaceSetOutlineCollapsedInput = z.output<typeof setOutlineCollapsed.input>
export type WorkspaceSetOutlineWidthInput = z.output<typeof setOutlineWidth.input>
