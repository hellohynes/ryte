import chokidar, { type FSWatcher } from 'chokidar'

type ChangeListener = (path: string) => void

/**
 * Watches a single file path for content changes. Reused by switching the
 * watched path (start() stops any existing watch first). Listens to 'change'
 * only — adds/unlinks are the indexer watcher's concern.
 */
export class ViewerWatcher {
  private fsw: FSWatcher | null = null
  private listeners = new Set<ChangeListener>()

  async watch(absPath: string): Promise<void> {
    await this.stop()
    this.fsw = chokidar.watch(absPath, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
    })
    this.fsw.on('change', (path) => {
      for (const cb of this.listeners) cb(path)
    })
  }

  async stop(): Promise<void> {
    await this.fsw?.close()
    this.fsw = null
  }

  onChange(cb: ChangeListener): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }
}

export const viewerWatcher = new ViewerWatcher()
