const MAX_ADDRESSES = 50
const MAX_ADDRESS_LENGTH = 300

export interface BlockedLog {
  /** Records one refused thing. The address is cut short, and shown to the person as plain text only. */
  add(address: string): void
}

/**
 * Counts what the locked view refused and keeps the last few addresses. `onChange` is called on the next tick, so
 * a page that fires a hundred requests at once causes one update, not a hundred.
 */
export function createBlockedLog(
  onChange: (state: { count: number; addresses: string[] }) => void
): BlockedLog {
  let count = 0
  let addresses: string[] = []
  let scheduled = false
  return {
    add(address) {
      count += 1
      addresses = [...addresses, address.slice(0, MAX_ADDRESS_LENGTH)].slice(-MAX_ADDRESSES)
      if (scheduled) return
      scheduled = true
      setTimeout(() => {
        scheduled = false
        onChange({ count, addresses })
      }, 100)
    }
  }
}
