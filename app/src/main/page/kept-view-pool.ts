import {
  KEPT_VIEWS_BUDGET_BYTES,
  KEPT_VIEWS_CEILING,
  pickToSleep,
  type ProcessMetric,
  type SleepEntry
} from './sleep-pick'

/** How often the pool checks memory again while it holds two or more views. */
const SWEEP_INTERVAL_MS = 60_000

export interface PoolEntry extends SleepEntry {
  /** Puts this view to sleep. */
  sleep: () => void
}

/** A set of kept views, in any number of windows, that the pool counts toward its limits. */
export interface PoolMember {
  size(): number
  /** Adds this member's views to `out`. A view that is `protect` is listed as shown, so it is not picked. */
  collect(out: PoolEntry[], protect: unknown): void
}

export interface KeptViewPoolOptions {
  /** Memory use of the app's processes, as `app.getAppMetrics()` reports it. Without it only the ceiling applies. */
  metrics?: () => ProcessMetric[]
  budgetBytes?: number
  ceiling?: number
}

/**
 * One memory budget and one ceiling for every kept view of every window and every box that joins it, with one
 * last-shown order and one timer. The page box and the local box share the app's pool.
 */
export interface KeptViewPool {
  /** The next number in the shared last-shown order. */
  stamp(): number
  join(member: PoolMember): void
  /** Puts views to sleep until the rest fit. `protect` stays this time: a view just added or just parked. */
  sweep(protect?: unknown): void
  /** Runs the timer only while two or more views are kept, and forgets members that hold none. */
  sync(): void
}

export function createKeptViewPool({
  metrics = () => [],
  budgetBytes = KEPT_VIEWS_BUDGET_BYTES,
  ceiling = KEPT_VIEWS_CEILING
}: KeptViewPoolOptions = {}): KeptViewPool {
  const members = new Set<PoolMember>()
  let tick = 0
  let timer: ReturnType<typeof setInterval> | null = null

  const sweep = (protect?: unknown): void => {
    const entries: PoolEntry[] = []
    for (const member of members) member.collect(entries, protect)
    if (entries.length < 2) return
    const sleepers = new Map(entries.map((entry) => [entry.key, entry.sleep]))
    for (const key of pickToSleep(entries, metrics(), budgetBytes, ceiling)) sleepers.get(key)?.()
  }

  return {
    stamp: () => (tick += 1),
    join: (member) => void members.add(member),
    sweep,
    sync() {
      let total = 0
      for (const member of [...members]) {
        const size = member.size()
        if (size === 0) members.delete(member)
        total += size
      }
      if (total >= 2 && !timer) {
        timer = setInterval(() => sweep(), SWEEP_INTERVAL_MS)
        timer.unref()
      } else if (total < 2 && timer) {
        clearInterval(timer)
        timer = null
      }
    }
  }
}
