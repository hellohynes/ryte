export interface IndexerRestartDependencies {
  watcher: { stop(): Promise<void>; start(notesRoot: string): void }
  indexer: { close(): void; init(): boolean }
  /** Stops every running search: they would read from a store that is about to be replaced. */
  cancelSearches: () => void
  /** Discards the cached search service, whose vector store is replaced; the next search builds a new one. */
  resetSearchService: () => void
  /** Read after the indexer is initialised, so the watcher starts on the notes root the store holds now. */
  notesRoot: () => string
  /** Starts an index pass. Called without waiting, only after a restart whose initialisation succeeded. */
  startReindex: () => Promise<void>
}

export interface IndexerRestartOptions {
  /** Start an index pass once the indexer and the watcher are running again (a different notes folder). */
  reindex?: boolean
}

function errorCode(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return typeof code === 'string' ? code : 'UNKNOWN'
}

/**
 * Re-initialises the indexer and restarts the watcher so a new notes root or embedding setting takes effect.
 * The steps run in this order: the watcher is stopped and awaited, searches are cancelled, the indexer is
 * closed and initialised, and the watcher starts again only when initialisation succeeded. When asked to, the
 * index pass is started last, in the background, and only after that same success, so a failed initialisation is
 * never followed by a second attempt. A step that throws stops the sequence and rejects; nothing after it runs.
 */
export function createIndexerRestarter({
  watcher,
  indexer,
  cancelSearches,
  resetSearchService,
  notesRoot,
  startReindex
}: IndexerRestartDependencies): (options?: IndexerRestartOptions) => Promise<void> {
  return async ({ reindex = false } = {}) => {
    await watcher.stop()
    cancelSearches()
    indexer.close()
    resetSearchService()
    const ready = indexer.init()
    if (ready) {
      watcher.start(notesRoot())
      if (reindex) {
        // Failures are reported through the index status; the code is logged so a path never is.
        const report = (error: unknown): void => {
          console.error('Ryte could not start indexing.', errorCode(error))
        }
        try {
          void startReindex().catch(report)
        } catch (error) {
          report(error)
        }
      }
    }
  }
}
