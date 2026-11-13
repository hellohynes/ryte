/** Memory the kept views' renderer processes may use together, per window. */
export const KEPT_VIEWS_BUDGET_BYTES = 1536 * 1024 * 1024

/** Most views a window keeps, whatever they weigh. A backstop for views that cost little. */
export const KEPT_VIEWS_CEILING = 24

/** The part of `app.getAppMetrics()` this needs. `workingSetSize` is in kilobytes. */
export interface ProcessMetric {
  pid: number
  memory: { workingSetSize: number }
}

export interface SleepEntry {
  key: string
  /** The view's renderer process. Zero or less while the view has none yet. */
  pid: number
  /** Position in the order views were last shown: lower was shown longer ago. */
  order: number
  shown: boolean
}

/**
 * Which kept views to put to sleep, least recently shown first, until the processes of the views left fit the
 * budget and there are no more than `ceiling` of them. A process that several views share counts once. The shown
 * view is never picked and at least one view is always left.
 */
export function pickToSleep(
  entries: readonly SleepEntry[],
  metrics: readonly ProcessMetric[],
  budgetBytes: number,
  ceiling: number
): string[] {
  const bytesOf = new Map<number, number>()
  for (const { pid, memory } of metrics) bytesOf.set(pid, memory.workingSetSize * 1024)

  const users = new Map<number, number>()
  for (const { pid } of entries) if (pid > 0) users.set(pid, (users.get(pid) ?? 0) + 1)
  let total = 0
  for (const pid of users.keys()) total += bytesOf.get(pid) ?? 0

  let left = entries.length
  const picked: string[] = []
  const oldestFirst = [...entries].sort((a, b) => a.order - b.order)
  for (const entry of oldestFirst) {
    if (left <= 1 || (total <= budgetBytes && left <= ceiling)) break
    if (entry.shown) continue
    picked.push(entry.key)
    left -= 1
    if (entry.pid > 0) {
      const remaining = (users.get(entry.pid) ?? 1) - 1
      users.set(entry.pid, remaining)
      if (remaining === 0) total -= bytesOf.get(entry.pid) ?? 0
    }
  }
  return picked
}
