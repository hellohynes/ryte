import { computed, type ComputedRef } from 'vue'

import type { WorkspaceFolderSortMode } from '../../../shared/workspace'
import { useFileCatalogStore } from '../stores/file-catalog'
import { useViewerStore } from '../stores/viewer'
import { useWorkspaceStore } from '../stores/workspace'
import {
  buildSidebarTree,
  modifiedAtMsBySourcePath,
  type SidebarTreeNode
} from './sidebar-tree-model'

type FolderSortModes = Readonly<Record<string, WorkspaceFolderSortMode>>

function sameSortModes(left: FolderSortModes, right: FolderSortModes): boolean {
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key])
}

/**
 * The sidebar's file tree, built from the notes folder's paths, each folder's sort order and the catalog's dates.
 * Every workspace write (a tab switch, an open, the saved scroll position) replaces the whole library state, so
 * the sort orders are compared by content: the tree, which can hold 100k paths, is rebuilt only when one changes.
 */
export function useSidebarTree(): ComputedRef<SidebarTreeNode[]> {
  const viewer = useViewerStore()
  const workspace = useWorkspaceStore()
  const catalog = useFileCatalogStore()
  const folderSortModes = computed<FolderSortModes>((previous) => {
    const next = workspace.library.folderSortModes
    return previous && sameSortModes(previous, next) ? previous : next
  })
  return computed(() => {
    if (!viewer.notesRoot || viewer.tree.length === 0) return []
    return buildSidebarTree(
      viewer.tree,
      folderSortModes.value,
      modifiedAtMsBySourcePath(catalog.files)
    )
  })
}
