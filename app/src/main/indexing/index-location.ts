import { createHash } from 'node:crypto'
import { readdirSync, realpathSync, rmSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

// The search index of each notes folder is its own database file under the app's data folder, never inside the notes folder (it
// holds copies of note text and would be synced or committed with the notes). A folder's file is named for the folder, so a
// folder change never reuses another folder's rows.
const INDEX_DIRECTORY = 'index'
// The single database every folder shared before the index belonged to a folder.
const LEGACY_FILES = ['index.db', 'index.db-wal', 'index.db-shm']
const INDEX_FILE = /^[0-9a-f]{16}\.db(-wal|-shm)?$/

export interface IndexLocation {
  /** The database file for this notes folder. */
  path: string
  /** The folder that holds every folder's database. */
  directory: string
  /** The folder could be resolved to its canonical path; an unresolved one is named from the path as given. */
  resolved: boolean
}

export interface DirectoryEntry {
  name: string
  isFile(): boolean
}

export interface IndexFileSystem {
  list(directory: string): DirectoryEntry[]
  remove(path: string): void
}

export type Canonicalize = (path: string) => string

function errorCode(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return typeof code === 'string' ? code : 'UNKNOWN'
}

/**
 * `realpathSync.native` is the only resolver allowed: it follows links and returns the case the file system stores, so one folder
 * reached through a link or in another case has one index.
 */
export function indexLocationFor(
  userData: string,
  notesRoot: string,
  canonicalize: Canonicalize = (path) => realpathSync.native(path)
): IndexLocation {
  let canonical = resolve(notesRoot)
  let resolved = false
  try {
    canonical = canonicalize(notesRoot)
    resolved = true
  } catch {
    // An unmounted or unreadable folder keeps the path it was given.
  }
  const id = createHash('sha256').update(canonical).digest('hex').slice(0, 16)
  const directory = join(userData, INDEX_DIRECTORY)
  return { path: join(directory, `${id}.db`), directory, resolved }
}

/**
 * Exactly the files that are no longer anyone's index: the legacy single database in the data folder, and the database of every
 * other folder in the index folder. Only regular files with an exact lowercase name are selected, so a directory, a link, an
 * unrelated file or an uppercase spelling is never touched, and nothing is selected for the current folder's own files.
 */
export function selectStaleIndexFiles(
  userData: string,
  current: IndexLocation,
  dataEntries: DirectoryEntry[],
  indexEntries: DirectoryEntry[]
): string[] {
  const currentName = basename(current.path)
  const keep = new Set([currentName, `${currentName}-wal`, `${currentName}-shm`])
  const stale: string[] = []
  for (const entry of dataEntries) {
    if (entry.isFile() && LEGACY_FILES.includes(entry.name)) stale.push(join(userData, entry.name))
  }
  for (const entry of indexEntries) {
    if (entry.isFile() && INDEX_FILE.test(entry.name) && !keep.has(entry.name)) {
      stale.push(join(current.directory, entry.name))
    }
  }
  return stale
}

const realFileSystem: IndexFileSystem = {
  list: (directory) => readdirSync(directory, { withFileTypes: true }),
  remove: (path) => rmSync(path, { force: true })
}

export interface StaleIndexResult {
  /** The legacy `index.db` existed and was deleted. */
  legacyRemoved: boolean
}

/**
 * Deletes what `selectStaleIndexFiles` selects. Does nothing when the folder could not be resolved, so a transient failure cannot
 * destroy a good index. A failure to list or delete is logged by code and never stops the caller; the file is tried again at the
 * next start.
 */
export function removeStaleIndexFiles(
  userData: string,
  current: IndexLocation,
  fileSystem: IndexFileSystem = realFileSystem
): StaleIndexResult {
  const result: StaleIndexResult = { legacyRemoved: false }
  if (!current.resolved) return result
  const list = (directory: string): DirectoryEntry[] => {
    try {
      return fileSystem.list(directory)
    } catch (error) {
      // A folder that does not exist yet has nothing to remove.
      if (errorCode(error) !== 'ENOENT') {
        console.error('Ryte could not list its index files.', errorCode(error))
      }
      return []
    }
  }
  const stale = selectStaleIndexFiles(userData, current, list(userData), list(current.directory))
  for (const path of stale) {
    try {
      fileSystem.remove(path)
      if (path === join(userData, 'index.db')) result.legacyRemoved = true
    } catch (error) {
      console.error('Ryte could not remove an old index file.', errorCode(error))
    }
  }
  return result
}
