import { defineStore } from 'pinia'
import { ref } from 'vue'

import { parseTypedLocalAddress, type LocalAddress } from '../../../shared/local-address'
import { useWorkspaceStore } from './workspace'

/**
 * Opening a local address: the one call every entry point (quick open, a link in a note, a later menu) uses. An
 * always-allowed address opens at once; any other asks first in the app's own dialog. Only the app's own UI calls
 * `ask`; a page can never reach it.
 */
export const useLocalAddressStore = defineStore('local-address', () => {
  const workspace = useWorkspaceStore()
  const pending = ref<LocalAddress | null>(null)
  // Goes up each time an address was opened, so a tab waiting for approval shows its page again.
  const openedVersion = ref(0)

  async function open(url: string, choice: 'once' | 'always'): Promise<void> {
    if (await workspace.openLocalAddress(url, choice)) openedVersion.value += 1
  }

  /** Opens a typed or clicked address in a new tab, asking first unless it is always allowed. */
  async function ask(typed: string): Promise<boolean> {
    const address = parseTypedLocalAddress(typed)
    if (!address) return false
    let approved: string[] = []
    try {
      approved = await window.ryte.localhost.listApprovals()
    } catch {
      // Not knowing means asking.
    }
    if (approved.includes(address.origin)) await open(address.url, 'always')
    else pending.value = address
    return true
  }

  async function choose(choice: 'once' | 'always'): Promise<void> {
    const address = pending.value
    pending.value = null
    if (address) await open(address.url, choice)
  }

  function cancel(): void {
    pending.value = null
  }

  return { pending, openedVersion, ask, choose, cancel }
})
