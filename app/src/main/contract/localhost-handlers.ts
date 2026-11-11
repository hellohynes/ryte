import type { Contract } from '../../contract'
import { parseLocalAddress } from '../../shared/local-address'
import type { Approvals } from '../localhost/approvals'
import type { Handlers } from './register'

export interface LocalhostHandlerDependencies {
  approvals: Approvals
}

/**
 * Approvals for opening a local address. Main decides every time: an address is checked as local on each call, and
 * an origin is allowed only while it is in the saved list or was allowed once and its tab is still open.
 */
export function createLocalhostHandlers({
  approvals
}: LocalhostHandlerDependencies): Handlers<Contract>['localhost'] {
  const allowedOnce = new Set<string>()
  return {
    listApprovals: () => approvals.list(),
    removeApproval: ({ origin }) => {
      approvals.remove(origin)
      allowedOnce.delete(origin)
      return approvals.list()
    },
    open: ({ url, choice }) => {
      const address = parseLocalAddress(url)
      if (!address) return { status: 'refused' }
      if (choice === 'always') approvals.add(address.origin)
      else allowedOnce.add(address.origin)
      return { status: 'ok', url: address.url, origin: address.origin }
    },
    release: ({ url }) => {
      const address = parseLocalAddress(url)
      if (address) allowedOnce.delete(address.origin)
    }
  }
}
