import type { WebContents } from 'electron'

import type { Contract } from '../../contract'
import { parseLocalAddress } from '../../shared/local-address'
import type { WorkspaceState } from '../../shared/workspace'
import type { Approvals } from '../localhost/approvals'
import type { LocalBox } from '../page/local-box'
import type { Handlers } from './register'

export interface LocalhostHandlerDependencies {
  approvals: Approvals
  box: LocalBox
  /** Opens the address in a tab and returns the new workspace. */
  openAddressTab: (url: string) => WorkspaceState
  /** Opens an address in the default browser. Resolves to whether it opened. */
  openInBrowser: (url: string) => boolean
  /** Whether the asking window just had a real click, Enter or Space; using it spends it. */
  hadRealInput: (sender: WebContents) => boolean
}

/**
 * Approvals and the locked view for a local address. Main decides every time: an address is checked as local on
 * each call, an answer counts only right after a real click or key in the window, and an origin may be shown only while it is in the saved list or was allowed once and its tab is still
 * open. The view belongs to the window that asked; the box shows one local page per window and keeps the others alive, hidden.
 */
export function createLocalhostHandlers({
  approvals,
  box,
  openAddressTab,
  openInBrowser,
  hadRealInput
}: LocalhostHandlerDependencies): Handlers<Contract>['localhost'] {
  const allowedOnce = new Set<string>()
  return {
    listApprovals: () => approvals.list(),
    removeApproval: ({ origin }) => {
      approvals.remove(origin)
      allowedOnce.delete(origin)
      // A page already open on it stops now; its tab asks again the next time it loads.
      box.closeOrigin(origin)
      return approvals.list()
    },
    open: ({ url, choice }, { sender }) => {
      const address = parseLocalAddress(url)
      // The prompt is the person's answer. A call with no real click or key just before it is not one.
      if (!address || !hadRealInput(sender)) return { status: 'refused' }
      if (choice === 'always') approvals.add(address.origin)
      else allowedOnce.add(address.origin)
      return { status: 'ok', workspace: openAddressTab(address.url) }
    },
    release: ({ url }) => {
      const address = parseLocalAddress(url)
      if (address) allowedOnce.delete(address.origin)
    },
    show: async ({ url, bounds }, { sender }) => {
      const address = parseLocalAddress(url)
      if (!address) return { status: 'blocked' }
      if (!approvals.has(address.origin) && !allowedOnce.has(address.origin)) {
        return { status: 'needs-approval' }
      }
      return { status: await box.show(sender, address, bounds) }
    },
    setBounds: ({ bounds }, { sender }) => box.setBounds(sender, bounds),
    hide: async (_input, { sender }) => ({ still: await box.hide(sender) }),
    park: ({ url }, { sender }) => {
      const address = parseLocalAddress(url)
      if (address) box.park(sender, address.url)
    },
    close: ({ url }, { sender }) => {
      const address = parseLocalAddress(url)
      return address ? box.close(sender, address.url) : undefined
    },
    retain: ({ urls }, { sender }) =>
      box.retain(
        sender,
        urls.flatMap((url) => parseLocalAddress(url)?.url ?? [])
      ),
    openInBrowser: ({ url }) => {
      const address = parseLocalAddress(url)
      return { opened: address ? openInBrowser(address.url) : false }
    }
  }
}
