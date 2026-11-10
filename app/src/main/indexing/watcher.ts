import { EventEmitter } from 'node:events'
import { realpath as fsRealpath, watch, type FSWatcher } from 'node:fs'
import { lstat, readdir, stat } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'

import { listedKindOf, supportedKindOf } from '../../shared/supported-types'
import { indexerService } from './indexer-service'

const TREE_CHANGED_EVENT = 'tree-changed'
const CATALOG_CHANGED_EVENT = 'catalog-changed'

// A path is decided on its final state this long after its last event, so a temporary file that is renamed away, or a burst of
// edits, produces one decision.
const DEBOUNCE_MS = 300
const DECISION_CONCURRENCY = 64
const WALK_CONCURRENCY = 16
const STAT_CONCURRENCY = 64
// A path that could not be read is tried again this many times, this long after the last try (times the try number).
const READ_RETRIES = 2
const READ_RETRY_MS = 1000
// The folder itself is checked this often: it can be deleted or renamed without any event arriving.
const ROOT_CHECK_MS = 5000
// A restarted watcher may restart again once it has run this long.
const RESTART_RENEWAL_MS = 60_000

export interface CatalogChangeEvent {
  type: 'upsert' | 'remove'
  path: string
  notesRoot: string
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
 * Lists every listed file (notes and supported pictures, see `listedKindOf`) and directory under `top` (including `top`),
 * without following symbolic links. `root` is the notes folder, which decides whether a picture's folder is skipped. A
 * directory that vanishes while the walk runs is skipped; any other unreadable directory below `top` is skipped and logged
 * by code. Resolves `null` if `top` itself is gone and rejects if it cannot be read.
 */
function walkTree(top: string, root: string, cancelled: () => boolean): Promise<Walked | null> {
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
              else if (entry.isFile() && listedKindOf(relative(root, path))) files.push(path)
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
  if (kind === 'file' && !supportedKindOf(path)) return kind
  try {
    return (await nativeRealpath(path)).endsWith(sep + basename(path)) ? kind : 'missing'
  } catch (error) {
    if (isGone(error)) return 'missing'
    throw error
  }
}

type Seen = Kind | 'unknown'

// What each path is right now, for at most STAT_CONCURRENCY paths at a time. A path that cannot be read for another reason than
// being gone is `unknown`, and is never acted on.
async function statAll(paths: string[], cancelled: () => boolean): Promise<Map<string, Seen>> {
  const seen = new Map<string, Seen>()
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < paths.length && !cancelled()) {
      const path = paths[next++] as string
      try {
        const stats = await lstat(path)
        seen.set(path, stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'missing')
      } catch (error) {
        seen.set(path, isGone(error) ? 'missing' : 'unknown')
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(STAT_CONCURRENCY, paths.length) }, worker))
  return seen
}

interface Session {
  root: string
  rootId: number | null
  fsw: FSWatcher | null
  closed: boolean
  ready: boolean
  canRestart: boolean
  checkingRoot: boolean
  /** Report every note found by the first walk: the folder was lost, or was not there, and the index may lack its notes. */
  reportAll: boolean
  /** Walks in progress, and the paths decided while any ran, so a walk's older picture does not undo a newer decision. */
  reconciling: number
  decided: Set<string>
  files: Set<string>
  /** How many known notes are under each folder, at any depth, so a path with nothing under it costs no scan. */
  counts: Map<string, number>
  dirs: Set<string>
  held: Set<string>
  timers: Map<string, ReturnType<typeof setTimeout>>
  retries: Map<string, number>
  housekeeping: Array<ReturnType<typeof setTimeout>>
  pending: Set<string>
  active: Set<string>
}

interface Change {
  tree: boolean
}

export class Watcher {
  private session: Session | null = null
  private waiting: ReturnType<typeof setInterval> | null = null
  private readonly events = new EventEmitter()
  private readonly pendingIndexOperations = new Map<string, 'changed' | 'removed'>()
  private processingIndexOperations = false

  start(notesRoot: string): void {
    this.clearWaiting()
    this.closeSession()
    this.open(notesRoot, true)
  }

  async stop(): Promise<void> {
    this.clearWaiting()
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

  private open(root: string, canRestart: boolean, reportAll = false): void {
    const session: Session = {
      root,
      rootId: null,
      fsw: null,
      closed: false,
      ready: false,
      canRestart,
      checkingRoot: false,
      reportAll,
      reconciling: 0,
      decided: new Set(),
      files: new Set(),
      counts: new Map(),
      dirs: new Set(),
      held: new Set(),
      timers: new Map(),
      retries: new Map(),
      housekeeping: [],
      pending: new Set(),
      active: new Set()
    }
    try {
      session.fsw = watch(root, { recursive: true }, (_event, filename) => {
        this.onEvent(session, filename)
      })
    } catch (error) {
      console.error('Ryte could not watch the notes folder.', errorCode(error))
      if (isGone(error)) this.waitForRoot(root)
      return
    }
    session.fsw.on('error', (error) => this.onWatchError(session, error))
    if (!canRestart) {
      session.housekeeping.push(
        setTimeout(() => {
          session.canRestart = true
        }, RESTART_RENEWAL_MS)
      )
    }
    this.session = session
    void this.seed(session).catch((error: unknown) => {
      console.error('Ryte could not start watching the notes folder.', errorCode(error))
    })
  }

  private closeSession(session: Session | null = this.session, keepIndexOperations = false): void {
    if (!session) return
    session.closed = true
    for (const timer of session.timers.values()) clearTimeout(timer)
    for (const timer of session.housekeeping) clearTimeout(timer)
    session.timers.clear()
    session.housekeeping.length = 0
    session.pending.clear()
    session.held.clear()
    try {
      session.fsw?.close()
    } catch (error) {
      console.error('Ryte could not close the notes folder watcher.', errorCode(error))
    }
    if (this.session === session) this.session = null
    // A stop or a new start drops what was not yet applied; a restart keeps it.
    if (!keepIndexOperations) this.pendingIndexOperations.clear()
  }

  private clearWaiting(): void {
    if (this.waiting) clearInterval(this.waiting)
    this.waiting = null
  }

  // Polls for a notes folder that is missing, so watching starts when it appears (a volume that is mounted later).
  private waitForRoot(root: string): void {
    this.clearWaiting()
    const timer = setInterval(() => {
      void stat(root).then(
        (stats) => {
          if (this.waiting !== timer || this.session || !stats.isDirectory()) return
          this.clearWaiting()
          this.open(root, true, true)
          this.emitTreeChanged()
        },
        () => undefined
      )
    }, ROOT_CHECK_MS)
    this.waiting = timer
  }

  private onWatchError(session: Session, error: unknown): void {
    if (session.closed) return
    console.error('Ryte lost the notes folder watcher.', errorCode(error))
    this.emitTreeChanged()
    const { root, canRestart } = session
    this.closeSession(session, true)
    // One restart in a row; a watcher that fails again soon after stays stopped, and the next reindex recovers what was missed.
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

  private schedule(session: Session, path: string, delay = DEBOUNCE_MS): void {
    const previous = session.timers.get(path)
    if (previous) clearTimeout(previous)
    session.timers.set(
      path,
      setTimeout(() => {
        session.timers.delete(path)
        this.decideNow(session, path)
      }, delay)
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
      void this.decide(session, path)
        .catch((error: unknown) => {
          console.error('Ryte could not decide a changed path.', errorCode(error))
        })
        .finally(() => {
          session.active.delete(path)
          this.pump(session)
        })
    }
  }

  private async seed(session: Session): Promise<void> {
    let walked: Walked | null
    try {
      walked = await walkTree(session.root, session.root, () => session.closed)
    } catch (error) {
      walked = null
      console.error('Ryte could not read the notes folder.', errorCode(error))
    }
    if (session.closed) return
    if (!walked) {
      this.closeSession(session, true)
      this.waitForRoot(session.root)
      return
    }
    try {
      const id = (await stat(session.root)).ino
      session.rootId = typeof id === 'number' ? id : null
    } catch {
      // The folder is checked again on the next tick.
    }
    if (session.closed) return
    for (const file of walked.files) this.addFile(session, file)
    session.dirs = new Set(walked.dirs)
    session.dirs.delete(session.root)
    session.ready = true
    session.housekeeping.push(
      setInterval(() => {
        void this.checkRoot(session).catch((error: unknown) => {
          console.error('Ryte could not check the notes folder.', errorCode(error))
        })
      }, ROOT_CHECK_MS)
    )
    if (session.reportAll) {
      this.emitTreeChanged()
      for (const file of walked.files) {
        this.emitCatalogChanged({ type: 'upsert', path: file, notesRoot: session.root })
        this.queueIndexOperation(file, 'changed')
      }
    }
    // Whatever happened while the walk ran is decided now, on the states the files are in.
    if (session.held.size > 0) {
      this.emitTreeChanged()
      for (const path of session.held) this.decideNow(session, path)
      session.held.clear()
    }
  }

  // Deleting or renaming the notes folder reports nothing, and the watcher is bound to the folder that was there.
  private async checkRoot(session: Session): Promise<void> {
    if (session.closed || session.checkingRoot) return
    session.checkingRoot = true
    let lost = false
    try {
      const stats = await stat(session.root)
      const id = typeof stats.ino === 'number' ? stats.ino : null
      lost =
        !stats.isDirectory() || (id !== null && session.rootId !== null && id !== session.rootId)
    } catch (error) {
      lost = isGone(error)
    } finally {
      session.checkingRoot = false
    }
    if (lost && !session.closed) this.onRootLost(session)
  }

  private onRootLost(session: Session): void {
    console.error('Ryte lost the notes folder.', 'ROOT_GONE')
    const { root } = session
    const known = [...session.files]
    this.closeSession(session, true)
    const change: Change = { tree: true }
    for (const file of known) this.removeFile(session, file, change)
    this.emitTreeChanged()
    this.waitForRoot(root)
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
        if (listedKindOf(relative(session.root, path))) {
          if (this.addFile(session, path)) change.tree = true
          this.emitCatalogChanged({ type: 'upsert', path, notesRoot: session.root })
          this.queueIndexOperation(path, 'changed')
        }
      } else {
        await this.reconcileDirectory(session, path, change)
      }
      session.retries.delete(path)
    } catch (error) {
      console.error('Ryte could not read a changed path.', errorCode(error))
      this.retry(session, path)
    }
    if (session.reconciling > 0) session.decided.add(path)
    if (change.tree && !session.closed) this.emitTreeChanged()
  }

  // A path that could not be read is tried again a few times; after that the next reindex recovers it.
  private retry(session: Session, path: string): void {
    if (session.closed) return
    const tried = session.retries.get(path) ?? 0
    if (tried >= READ_RETRIES) {
      session.retries.delete(path)
      return
    }
    session.retries.set(path, tried + 1)
    this.schedule(session, path, READ_RETRY_MS * (tried + 1))
  }

  private addFile(session: Session, path: string): boolean {
    if (session.files.has(path)) return false
    session.files.add(path)
    this.countUnder(session, path, 1)
    return true
  }

  private countUnder(session: Session, path: string, delta: number): void {
    for (let dir = dirname(path); ; dir = dirname(dir)) {
      const count = (session.counts.get(dir) ?? 0) + delta
      if (count > 0) session.counts.set(dir, count)
      else session.counts.delete(dir)
      if (dir === session.root || dirname(dir) === dir) break
    }
  }

  // A known file, a known folder, or a folder only its notes were known for.
  private dropKnown(session: Session, path: string, change: Change): void {
    if (session.files.has(path)) this.removeFile(session, path, change)
    else this.removeSubtree(session, path, change)
  }

  private removeFile(session: Session, path: string, change: Change): void {
    if (session.files.delete(path)) this.countUnder(session, path, -1)
    change.tree = true
    this.emitCatalogChanged({ type: 'remove', path, notesRoot: session.root })
    this.queueIndexOperation(path, 'removed')
  }

  private knownFilesUnder(session: Session, path: string): string[] {
    if (!session.counts.get(path)) return []
    const prefix = path + sep
    const found: string[] = []
    for (const file of session.files) if (file.startsWith(prefix)) found.push(file)
    return found
  }

  private knownDirsUnder(session: Session, path: string): string[] {
    const prefix = path + sep
    const found: string[] = []
    for (const dir of session.dirs) if (dir.startsWith(prefix)) found.push(dir)
    return found
  }

  private removeSubtree(session: Session, path: string, change: Change): void {
    const files = this.knownFilesUnder(session, path)
    const isFolder = session.dirs.delete(path)
    // Nothing known at or under the path (a deleted temporary or non-markdown file): no scan of the known folders either.
    if (!isFolder && files.length === 0) return
    for (const file of files) this.removeFile(session, file, change)
    for (const dir of this.knownDirsUnder(session, path)) session.dirs.delete(dir)
    change.tree = true
  }

  // A folder created, copied in, moved in, or renamed onto an existing folder reports no events for what is inside, so its
  // subtree is compared with what is known. The walk can take a while, so what it found is checked against the folder before it
  // is acted on: a note saved or deleted meanwhile is decided by its own event, and an unreadable folder removes nothing.
  private async reconcileDirectory(session: Session, path: string, change: Change): Promise<void> {
    if (session.files.has(path)) this.removeFile(session, path, change)
    const knownFiles = this.knownFilesUnder(session, path)
    const knownDirs = this.knownDirsUnder(session, path)
    session.reconciling += 1
    try {
      await this.reconcileWalk(session, path, change, knownFiles, knownDirs)
    } finally {
      session.reconciling -= 1
      if (session.reconciling === 0) session.decided.clear()
    }
  }

  private async reconcileWalk(
    session: Session,
    path: string,
    change: Change,
    knownFiles: string[],
    knownDirs: string[]
  ): Promise<void> {
    const walked = await walkTree(path, session.root, () => session.closed)
    if (session.closed) return
    if (!walked) {
      this.dropKnown(session, path, change)
      return
    }
    const seenFiles = new Set(walked.files)
    const seenDirs = new Set(walked.dirs)
    const candidates = {
      addFiles: walked.files.filter((file) => !session.files.has(file)),
      addDirs: walked.dirs.filter((dir) => !session.dirs.has(dir)),
      dropFiles: knownFiles.filter((file) => !seenFiles.has(file)),
      dropDirs: knownDirs.filter((dir) => !seenDirs.has(dir))
    }
    const seen = await statAll(
      [
        ...candidates.addFiles,
        ...candidates.addDirs,
        ...candidates.dropFiles,
        ...candidates.dropDirs
      ],
      () => session.closed
    )
    if (session.closed) return
    for (const dir of candidates.addDirs) {
      if (seen.get(dir) === 'directory' && !session.dirs.has(dir)) {
        session.dirs.add(dir)
        change.tree = true
      }
    }
    for (const file of candidates.addFiles) {
      // A path decided while the walk ran was decided on newer information than the walk's.
      if (seen.get(file) !== 'file' || session.decided.has(file) || !this.addFile(session, file))
        continue
      change.tree = true
      this.emitCatalogChanged({ type: 'upsert', path: file, notesRoot: session.root })
      this.queueIndexOperation(file, 'changed')
    }
    for (const file of candidates.dropFiles) {
      const now = seen.get(file)
      if (now !== undefined && now !== 'file' && now !== 'unknown' && session.files.has(file)) {
        this.removeFile(session, file, change)
      }
    }
    for (const dir of candidates.dropDirs) {
      const now = seen.get(dir)
      if (
        now !== undefined &&
        now !== 'directory' &&
        now !== 'unknown' &&
        session.dirs.delete(dir)
      ) {
        change.tree = true
      }
    }
  }

  // A listener that throws (a window that is gone) must not stop the watcher.
  private emitTreeChanged(): void {
    try {
      this.events.emit(TREE_CHANGED_EVENT)
    } catch (error) {
      console.error('Ryte could not notify a file tree listener.', errorCode(error))
    }
  }

  private emitCatalogChanged(event: CatalogChangeEvent): void {
    try {
      this.events.emit(CATALOG_CHANGED_EVENT, event)
    } catch (error) {
      console.error('Ryte could not notify a catalog listener.', errorCode(error))
    }
  }

  // Only notes are indexed; a picture is listed and never indexed.
  private queueIndexOperation(path: string, operation: 'changed' | 'removed'): void {
    if (supportedKindOf(path) !== 'note') return
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
        console.error('Ryte could not apply a watched file change.', errorCode(error))
      }
    }
    this.processingIndexOperations = false
  }
}

export const watcher = new Watcher()
