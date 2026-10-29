import { EventEmitter } from 'node:events'

import chokidar, { type FSWatcher } from 'chokidar'

import { indexerService } from './indexer-service'

const TREE_CHANGED_EVENT = 'tree-changed'
const CATALOG_CHANGED_EVENT = 'catalog-changed'

export interface CatalogChangeEvent {
  type: 'upsert' | 'remove'
  path: string
  notesRoot: string
}

function isMarkdownFile(path: string): boolean {
  return path.toLowerCase().endsWith('.md')
}

export class Watcher {
  private fsw: FSWatcher | null = null
  private readonly events = new EventEmitter()
  private readonly pendingIndexOperations = new Map<string, 'changed' | 'removed'>()
  private processingIndexOperations = false

  start(notesRoot: string): void {
    if (this.fsw) this.stop()
    this.fsw = chokidar.watch(notesRoot, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
    })
    this.fsw.on('add', (path) => {
      if (!isMarkdownFile(path)) return
      this.emitTreeChanged()
      this.emitCatalogChanged({ type: 'upsert', path, notesRoot })
      this.queueIndexOperation(path, 'changed')
    })
    this.fsw.on('change', (path) => {
      if (!isMarkdownFile(path)) return
      this.emitCatalogChanged({ type: 'upsert', path, notesRoot })
      this.queueIndexOperation(path, 'changed')
    })
    this.fsw.on('unlink', (path) => {
      if (!isMarkdownFile(path)) return
      this.emitTreeChanged()
      this.emitCatalogChanged({ type: 'remove', path, notesRoot })
      this.queueIndexOperation(path, 'removed')
    })
    this.fsw.on('addDir', () => {
      this.emitTreeChanged()
    })
    this.fsw.on('unlinkDir', () => {
      this.emitTreeChanged()
    })
  }

  async stop(): Promise<void> {
    await this.fsw?.close()
    this.fsw = null
    this.pendingIndexOperations.clear()
  }

  onTreeChanged(cb: () => void): () => void {
    this.events.on(TREE_CHANGED_EVENT, cb)
    return () => this.events.off(TREE_CHANGED_EVENT, cb)
  }

  onCatalogChanged(cb: (event: CatalogChangeEvent) => void): () => void {
    this.events.on(CATALOG_CHANGED_EVENT, cb)
    return () => this.events.off(CATALOG_CHANGED_EVENT, cb)
  }

  private emitTreeChanged(): void {
    this.events.emit(TREE_CHANGED_EVENT)
  }

  private emitCatalogChanged(event: CatalogChangeEvent): void {
    this.events.emit(CATALOG_CHANGED_EVENT, event)
  }

  private queueIndexOperation(path: string, operation: 'changed' | 'removed'): void {
    this.pendingIndexOperations.set(path, operation)
    if (this.processingIndexOperations) return
    this.processingIndexOperations = true
    void this.drainIndexOperations()
  }

  private async drainIndexOperations(): Promise<void> {
    while (this.pendingIndexOperations.size > 0) {
      const next = this.pendingIndexOperations.entries().next().value
      if (!next) break
      const [path, operation] = next
      this.pendingIndexOperations.delete(path)
      try {
        if (operation === 'changed') {
          await indexerService.notifyFileChanged(path)
        } else {
          await indexerService.notifyFileRemoved(path)
        }
      } catch (error) {
        console.error('Ryte could not apply a watched file change.', error)
      }
    }
    this.processingIndexOperations = false
  }
}

export const watcher = new Watcher()
