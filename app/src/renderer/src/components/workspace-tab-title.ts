import {
  isWorkspaceAddressTab,
  isWorkspaceSourceFileRef,
  type WorkspaceTab
} from '../../../shared/workspace'
import { supportedKindOf } from '../../../shared/supported-types'

/**
 * The label a tab shows. A note in the notes folder shows its document title (front-matter title, else the first
 * heading), which the file catalog already holds. A note with no title of its own, and every other kind of tab,
 * keeps the file name the tab has always shown. The catalog falls back to the file name without `.md`, so that
 * value means "no document title".
 */
export function workspaceTabLabel(
  tab: WorkspaceTab,
  catalogTitleOf: (sourcePath: string) => string | null
): string {
  if (isWorkspaceAddressTab(tab) || !isWorkspaceSourceFileRef(tab)) return tab.title
  if (supportedKindOf(tab.sourcePath) !== 'note') return tab.title

  const catalogTitle = catalogTitleOf(tab.sourcePath)
  if (!catalogTitle) return tab.title
  const withoutExtension = tab.title.replace(/\.md$/i, '')
  return catalogTitle === withoutExtension ? tab.title : catalogTitle
}
