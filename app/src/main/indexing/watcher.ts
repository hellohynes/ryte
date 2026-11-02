import { EventEmitter } from 'node:events'
import { realpath as fsRealpath, watch, type FSWatcher } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { basename, join, sep } from 'node:path'

import { indexerService } from './indexer-service'

const TREE_CHANGED_EVENT = 'tree-changed'
const CATALOG_CHANGED_EVENT = 'catalog-changed'

// A path is decided on its final state this long after its last event, so a temporary file that is renamed away, or a burst of
// edits, produces one decision.
const DEBOUNCE_MS = 300
const DECISION_CONCURRENCY = 64
const WALK_CONCURRENCY = 16

export interface CatalogChangeEvent {
  type: 'upsert' | 'remove'
  path: string
  notesRoot: string
}

function isMarkdownFile(path: string): boolean {
  return path.toLowerCase().endsWith('.md')
}

// Logged instead of the error itself: an error message names the path, which is a note title.
function errorCode(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return typeof code === 'string' ? code : 'UNKNOWN'
}

function isGone(error: unknown): boolean {
  const code = errorCode(error)
  return code === 'ENOENT' || code === 'ENOTDIR'
}

// The case the file system stores for the leaf. macOS reports and resolves both names of a case-only rename.
function nativeRealpath(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fsRealpath.native(path, (error, resolved) => (error ? reject(error) : resolve(resolved)))
  })
}

interface Walked {
  files: string[]
  dirs: string[]
}

/**
 * Lists every markdown file and directory under `top` (including `top`), without following symbolic links. A directory that
 * vanishes while the walk runs is skipped; any other unreadable directory below `top` is skipped and logged by code. Resolves
 * `null` if `top` itself is gone and rejects if it cannot be read.
 */
function walkTree(top: string, cancelled: () => boolean): Promise<Walked | null> {
  return new Promise((resolve, reject) => {
    const files: string[] = []
    const dirs: string[] = []
    const queue = [top]
    let inflight = 0
    let topGone = false
    let topError: unknown = null

    const pump = (): void => {
      if (cancelled()) queue.length = 0
      while (inflight < WALK_CONCURRENCY && queue.length > 0) {
        const dir = queue.pop() as string
        inflight += 1
        readdir(dir, { withFileTypes: true })
          .then((entries) => {
            dirs.push(dir)
            for (const entry of entries) {
              const path = join(dir, entry.name)
              if (entry.isDirectory()) queue.push(path)
              else if (entry.isFile() && isMarkdownFile(entry.name)) files.push(path)
            }
          })
          .catch((error: unknown) => {
            if (dir === top) {
              if (isGone(error)) topGone = true
              else topError = error
              queue.length = 0
            } else if (!isGone(error)) {
              console.error('Ryte could not read a folder while watching.', errorCode(error))
            }
          })
          .finally(() => {
            inflight -= 1
            pump()
          })
      }
      if (inflight === 0 && queue.length === 0) {
        if (topError) reject(topError)
        else resolve(topGone ? null : { files, dirs })
      }
    }
    pump()
  })
}

type Kind = 'missing' | 'file' | 'directory'

// What the path is now. A symbolic link, a socket and a path that is the old name of a case-only rename count as missing.
async function classify(path: string): Promise<Kind> {
  let stats
  try {
    stats = await lstat(path)
  } catch (error) {
    if (isGone(error)) return 'missing'
    throw error
  }
  const isDirectory = stats.isDirectory()
  if (!isDirectory && !stats.isFile()) return 'missing'
  const kind: Kind = isDirectory ? 'directory' : 'file'
  if (kind === 'file' && !isMarkdownFile(path)) return kind
  try {
    return (await nativeRealpath(path)).endsWith(sep + basename(path)) ? kind : 'missing'
  } catch (error) {
    if (isGone(error)) return 'missing'
    throw error
  }
}

interface Session {
  root: string
  fsw: FSWatcher | null
  closed: boolean
  ready: boolean
  canRestart: boolean
  files: Set<string>
  dirs: Set<string>
  held: Set<string>
  timers: Map<string, ReturnType<typeof setTimeout>>
  pending: Set<string>
  active: Set<string>
}

interface Change {
  tree: boolean
}

export class Watcher {
  private session: Session | null = null
  private readonly events = new EventEmitter()
  private readonly pendingIndexOperations = new Map<string, 'changed' | 'removed'>()
  private processingIndexOperations = false

  start(notesRoot: string): void {
    this.closeSession()
    this.open(notesRoot, true)
  }

  async stop(): Promise<void> {
    this.closeSession()
  }

  onTreeChanged(cb: () => void): () => void {
    this.events.on(TREE_CHANGED_EVENT, cb)
    return () => this.events.off(TREE_CHANGED_EVENT, cb)
  }

  onCatalogChanged(cb: (event: CatalogChangeEvent) => void): () => void {
    this.events.on(CATALOG_CHANGED_EVENT, cb)
    return () => this.events.off(CATALOG_CHANGED_EVENT, cb)
  }

  private open(root: string, canRestart: boolean): void {
    const session: Session = {
      root,
      fsw: null,
      closed: false,
      ready: false,
      canRestart,
      files: new Set(),
      dirs: new Set(),
      held: new Set(),
      timers: new Map(),
      pending: new Set(),
      active: new Set()
    }
    try {
      session.fsw = watch(root, { recursive: true }, (_event, filename) => {
        this.onEvent(session, filename)
      })
    } catch (error) {
      console.error('Ryte could not watch the notes folder.', errorCode(error))
      return
    }
    session.fsw.on('error', (error) => this.onWatchError(session, error))
    this.session = session
    void this.seed(session)
  }

  private closeSession(session: Session | null = this.session): void {
    if (!session) return
    session.closed = true
    for (const timer of session.timers.values()) clearTimeout(timer)
    session.timers.clear()
    session.pending.clear()
    session.held.clear()
    try {
      session.fsw?.close()
    } catch (error) {
      console.error('Ryte could not close the notes folder watcher.', errorCode(error))
    }
    if (this.session === session) this.session = null
    this.pendingIndexOperations.clear()
  }

  private onWatchError(session: Session, error: unknown): void {
    if (session.closed) return
    console.error('Ryte lost the notes folder watcher.', errorCode(error))
    this.emitTreeChanged()
    const { root, canRestart } = session
    this.closeSession(session)
    // One restart; a watcher that fails again stays stopped, and the next reindex recovers what was missed.
    if (canRestart) this.open(root, false)
  }

  private onEvent(session: Session, filename: string | null): void {
    if (session.closed || !filename) return
    const path = join(session.root, filename)
    if (path === session.root) return
    if (!session.ready) {
      session.held.add(path)
      return
    }
    this.schedule(session, path)
  }

  private schedule(session: Session, path: string): void {
    const previous = session.timers.get(path)
    if (previous) clearTimeout(previous)
    session.timers.set(
      path,
      setTimeout(() => {
        session.timers.delete(path)
        this.decideNow(session, path)
      }, DEBOUNCE_MS)
    )
  }

  private decideNow(session: Session, path: string): void {
    if (session.closed) return
    session.pending.add(path)
    this.pump(session)
  }

  // Decisions run in parallel up to a bound, and never two at once for the same path.
  private pump(session: Session): void {
    for (const path of session.pending) {
      if (session.closed || session.active.size >= DECISION_CONCURRENCY) return
      if (session.active.has(path)) continue
      session.pending.delete(path)
      session.active.add(path)
      void this.decide(session, path).finally(() => {
        session.active.delete(path)
        this.pump(session)
      })
    }
  }

  private async seed(session: Session): Promise<void> {
    let walked: Walked | null
    try {
      walked = await walkTree(session.root, () => session.closed)
    } catch (error) {
      walked = null
      console.error('Ryte could not read the notes folder.', errorCode(error))
    }
    if (session.closed) return
    if (!walked) {
      this.closeSession(session)
      return
    }
    session.files = new Set(walked.files)
    session.dirs = new Set(walked.dirs)
    session.dirs.delete(session.root)
    session.ready = true
    // Whatever happened while the walk ran is decided now, on the states the files are in.
    if (session.held.size > 0) {
      this.emitTreeChanged()
      for (const path of session.held) this.decideNow(session, path)
      session.held.clear()
    }
  }

  private async decide(session: Session, path: string): Promise<void> {
    const change: Change = { tree: false }
    try {
      const kind = await classify(path)
      if (session.closed) return
      if (kind === 'missing') {
        this.dropKnown(session, path, change)
      } else if (kind === 'file') {
        // A folder replaced by a file leaves nothing of the folder's notes.
        if (session.dirs.has(path)) this.removeSubtree(session, path, change)
        if (isMarkdownFile(path)) {
          if (!session.files.has(path)) {
            session.files.add(path)
            change.tree = true
          }
          this.emitCatalogChanged({ type: 'upsert', path, notesRoot: session.root })
          this.queueIndexOperation(path, 'changed')
        }
      } else {
        await this.reconcileDirectory(session, path, change)
      }
    } catch (error) {
      console.error('Ryte could not read a changed path.', errorCode(error))
    }
    if (change.tree && !session.closed) this.emitTreeChanged()
  }

  // A known file, a known folder, or a folder only its notes were known for.
  private dropKnown(session: Session, path: string, change: Change): void {
    if (session.files.has(path)) this.removeFile(session, path, change)
    else this.removeSubtree(session, path, change)
  }

  private removeFile(session: Session, path: string, change: Change): void {
    session.files.delete(path)
    change.tree = true
    this.emitCatalogChanged({ type: 'remove', path, notesRoot: session.root })
    this.queueIndexOperation(path, 'removed')
  }

  private removeSubtree(session: Session, path: string, change: Change): void {
    const prefix = path + sep
    for (const file of [...session.files]) {
      if (file.startsWith(prefix)) this.removeFile(session, file, change)
    }
    if (session.dirs.delete(path)) change.tree = true
    for (const dir of [...session.dirs]) {
      if (dir.startsWith(prefix)) {
        session.dirs.delete(dir)
        change.tree = true
      }
    }
  }

  // A folder created, copied in, moved in, or renamed onto an existing folder reports no events for what is inside, so its
  // subtree is compared with what is known.
  private async reconcileDirectory(session: Session, path: string, change: Change): Promise<void> {
    if (session.files.has(path)) this.removeFile(session, path, change)
    const walked = await walkTree(path, () => session.closed)
    if (session.closed) return
    if (!walked) {
      this.dropKnown(session, path, change)
      return
    }
    const seenFiles = new Set(walked.files)
    const seenDirs = new Set(walked.dirs)
    for (const dir of walked.dirs) {
      if (!session.dirs.has(dir)) {
        session.dirs.add(dir)
        change.tree = true
      }
    }
    for (const file of walked.files) {
      if (session.files.has(file)) continue
      session.files.add(file)
      change.tree = true
      this.emitCatalogChanged({ type: 'upsert', path: file, notesRoot: session.root })
      this.queueIndexOperation(file, 'changed')
    }
    const prefix = path + sep
    for (const file of [...session.files]) {
      if (file.startsWith(prefix) && !seenFiles.has(file)) this.removeFile(session, file, change)
    }
    for (const dir of [...session.dirs]) {
      if (dir.startsWith(prefix) && !seenDirs.has(dir)) {
        session.dirs.delete(dir)
        change.tree = true
      }
    }
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
