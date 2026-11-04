import type { Contract } from '../../contract'
import type { WorkspaceStore } from '../workspace/workspace-store'
import type { Handlers } from './register'

export interface WorkspaceHandlerDependencies {
  store: Pick<
    WorkspaceStore,
    | 'publicState'
    | 'updateShell'
    | 'updateLibrary'
    | 'focusTab'
    | 'closeTab'
    | 'updateTabViewMode'
    | 'setOutlineCollapsed'
    | 'setOutlineWidth'
  >
}

/**
 * The handlers for the workspace operations that only change or read stored state. The operations that also refresh
 * the application menu or open a dialog are still hand-written in `ipc.ts`. Input is already validated, and each
 * handler returns what the store returns.
 */
export function createWorkspaceHandlers({
  store
}: WorkspaceHandlerDependencies): Handlers<Contract>['workspace'] {
  return {
    getState: async () => store.publicState(),
    updateShell: async (patch) => store.updateShell(patch),
    updateLibrary: async (patch) => store.updateLibrary(patch),
    focusTab: async (input) => store.focusTab(input),
    closeTab: async (input) => store.closeTab(input),
    updateTabViewMode: async (input) => store.updateTabViewMode(input),
    setOutlineCollapsed: async (input) => store.setOutlineCollapsed(input),
    setOutlineWidth: async (input) => store.setOutlineWidth(input)
  }
}
