import { supportedKindOf } from '../../../shared/supported-types'
import {
  isWorkspaceAddressTab,
  isWorkspaceSourceFileRef,
  type WorkspaceTab
} from '../../../shared/workspace'
import { toast } from '../stencil/toast-store'

/** What a tab opens in the browser: an HTML page in the notes folder, or a local address. Null for every other tab. */
export function browserTargetOf(
  tab: WorkspaceTab | null | undefined
): { url: string } | { path: string } | null {
  if (!tab) return null
  if (isWorkspaceAddressTab(tab)) return { url: tab.url }
  if (isWorkspaceSourceFileRef(tab) && supportedKindOf(tab.sourcePath) === 'html') {
    return { path: tab.sourcePath }
  }
  return null
}

/** Opens the tab's page in the default browser, and says so when it could not. Does nothing for a tab that is not a page. */
export async function openTabInBrowser(tab: WorkspaceTab | null | undefined): Promise<void> {
  const target = browserTargetOf(tab)
  if (!target) return
  try {
    const { opened } =
      'url' in target
        ? await window.ryte.localhost.openInBrowser(target)
        : await window.ryte.page.openInBrowser(target)
    if (opened) return
  } catch {
    // Reported below, the same as a refusal.
  }
  toast({ message: "Couldn't open it in the browser", tone: 'danger' })
}
