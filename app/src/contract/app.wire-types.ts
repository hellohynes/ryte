// FROZEN SNAPSHOT of the hand-written `app` declarations in `src/preload/index.ts`, `src/shared/app-menu.ts` and
// `src/shared/workspace.ts` before the contract replaced them (copied from git at a8e06fa; `getVersion` moved first,
// then `onMenuCommand`). It is the oracle for the type-equality check in `app.wire-types.check.ts`: the types inferred
// from the contract must equal it. Do not edit.
// Edited once, on purpose, for the open-in-browser menu command.

interface WorkspaceSourceFileRef {
  sourcePath: string
  externalPath?: never
}

interface WorkspaceExternalFileRef {
  externalPath: string
  sourcePath?: never
}

type WorkspaceOpenRecentFileInput = WorkspaceSourceFileRef | WorkspaceExternalFileRef

export type AppMenuCommand =
  | { type: 'open-native-file' }
  | { type: 'open-source-path'; sourcePath: string }
  | { type: 'open-recent-file'; file: WorkspaceOpenRecentFileInput }
  | { type: 'close-active-tab' }
  | { type: 'close-all-tabs' }
  | { type: 'focus-next-tab' }
  | { type: 'focus-previous-tab' }
  | { type: 'toggle-sidebar' }
  | { type: 'toggle-source-mode' }
  | { type: 'open-settings' }
  | { type: 'open-in-browser' }

export interface AppApi {
  getVersion(): Promise<string>
  onMenuCommand(cb: (command: AppMenuCommand) => void): () => void
}
