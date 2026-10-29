import { useIndexStatusStore } from '../stores/index-status'
import { useSettingsStore } from '../stores/settings'
import { createSaveFailures, type SaveFailures } from './save-failure'
import { createSaveQueue } from './save-queue'
import { patchRequiresReindex } from './reindex-triggers'

// One queue and one notice for every pane, so a change made on one pane never overlaps one made on
// another, and a failure shows in one place.
const queue = createSaveQueue()

const saves = createSaveFailures((patch) =>
  queue.run(async () => {
    const settings = useSettingsStore()
    const before = settings.state
    await settings.save(patch)
    if (before && patchRequiresReindex(before, patch)) {
      void useIndexStatusStore()
        .triggerReindex()
        .catch(() => undefined)
    }
  })
)

/**
 * Saves a preference the moment its control changes. The result is the new truth: the settings
 * store holds it once the save returns, and a failed save leaves the old value in place and shows a
 * notice (see `failure`) the reader can retry from. A change that affects what is indexed starts a
 * reindex.
 */
export function usePreferenceSaves(): SaveFailures & { refresh: () => Promise<void> } {
  /**
   * Reads the saved settings again, after any save already waiting, so a stale read never wins.
   * Rejects when they could not be read, since the store itself only records the error.
   */
  function refresh(): Promise<void> {
    return queue.run(async () => {
      const settings = useSettingsStore()
      await settings.hydrate()
      if (settings.error) throw new Error(settings.error)
    })
  }
  return { ...saves, refresh }
}
