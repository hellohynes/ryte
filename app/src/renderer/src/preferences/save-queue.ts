/**
 * Settings are saved the moment a control changes, so two quick changes must not overlap: each
 * save starts after the one before it has finished, and a failure only fails its own caller.
 */
export function createSaveQueue(): { run: <T>(task: () => Promise<T>) => Promise<T> } {
  let tail: Promise<unknown> = Promise.resolve()
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task)
      tail = result.catch(() => undefined)
      return result
    }
  }
}
