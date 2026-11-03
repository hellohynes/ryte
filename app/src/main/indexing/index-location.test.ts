import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  indexLocationFor,
  removeStaleIndexFiles,
  selectStaleIndexFiles,
  type DirectoryEntry,
  type IndexFileSystem
} from './index-location'

const DATA = '/synthetic/data'
const file = (name: string): DirectoryEntry => ({ name, isFile: () => true })
const notFile = (name: string): DirectoryEntry => ({ name, isFile: () => false })
const identity = (path: string): string => path

describe('indexLocationFor', () => {
  it('names the database for the folder, in the index folder of the data folder', () => {
    const location = indexLocationFor(DATA, '/synthetic/notes-a', identity)

    expect(location.directory).toBe(join(DATA, 'index'))
    expect(basename(location.path)).toMatch(/^[0-9a-f]{16}\.db$/)
    expect(location.path.startsWith(`${join(DATA, 'index')}/`)).toBe(true)
    expect(location.resolved).toBe(true)
  })

  it('gives one folder one file and two folders two files', () => {
    const a = indexLocationFor(DATA, '/synthetic/a', identity)
    const again = indexLocationFor(DATA, '/synthetic/a', identity)
    const b = indexLocationFor(DATA, '/synthetic/b', identity)

    expect(again.path).toBe(a.path)
    expect(b.path).not.toBe(a.path)
  })

  it('keeps two folders that differ only in case apart when the resolver keeps them apart', () => {
    expect(indexLocationFor(DATA, '/synthetic/Notes', identity).path).not.toBe(
      indexLocationFor(DATA, '/synthetic/notes', identity).path
    )
  })

  it('names the file from what the resolver returns, so a link and its target agree', () => {
    const resolver = (path: string): string =>
      path === '/synthetic/link' ? '/synthetic/real' : path

    expect(indexLocationFor(DATA, '/synthetic/link', resolver).path).toBe(
      indexLocationFor(DATA, '/synthetic/real', resolver).path
    )
  })

  it('keeps the path as given, and says so, when the folder cannot be resolved', () => {
    const missing = (): string => {
      throw Object.assign(new Error('gone'), { code: 'ENOENT' })
    }

    const location = indexLocationFor(DATA, '/synthetic/unmounted/', missing)

    expect(location.resolved).toBe(false)
    expect(basename(location.path)).toMatch(/^[0-9a-f]{16}\.db$/)
    // A trailing slash is the same folder.
    expect(indexLocationFor(DATA, '/synthetic/unmounted', missing).path).toBe(location.path)
  })
})

describe('indexLocationFor on a real file system', () => {
  let work: string

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'ryte-index-location-'))
  })

  afterEach(() => {
    rmSync(work, { recursive: true, force: true })
  })

  it('gives a folder and a symbolic link to it the same file', () => {
    const real = join(work, 'notes')
    mkdirSync(real)
    const link = join(work, 'link-to-notes')
    symlinkSync(real, link)

    expect(indexLocationFor(DATA, link).path).toBe(indexLocationFor(DATA, real).path)
    expect(indexLocationFor(DATA, link).resolved).toBe(true)
  })

  it('gives a folder written in another case the same file on a case-insensitive volume', () => {
    const real = join(work, 'CaseDir')
    mkdirSync(real)
    const otherCase = join(work, 'casedir')
    // Only a case-insensitive volume can open the folder under the other spelling.
    if (!existsSync(otherCase)) return

    expect(indexLocationFor(DATA, otherCase).path).toBe(indexLocationFor(DATA, real).path)
  })

  it('does not resolve a folder that is not there', () => {
    expect(indexLocationFor(DATA, join(work, 'missing')).resolved).toBe(false)
  })
})

describe('selectStaleIndexFiles', () => {
  const current = indexLocationFor(DATA, '/synthetic/current', identity)
  const currentName = basename(current.path)
  const other = '0123456789abcdef.db'

  it('selects the legacy database and its side files in the data folder', () => {
    const stale = selectStaleIndexFiles(
      DATA,
      current,
      [file('index.db'), file('index.db-wal'), file('index.db-shm')],
      []
    )

    expect(stale).toEqual([
      join(DATA, 'index.db'),
      join(DATA, 'index.db-wal'),
      join(DATA, 'index.db-shm')
    ])
  })

  it("selects every other folder's database and side files, and keeps the current folder's", () => {
    const stale = selectStaleIndexFiles(
      DATA,
      current,
      [],
      [
        file(currentName),
        file(`${currentName}-wal`),
        file(`${currentName}-shm`),
        file(other),
        file(`${other}-wal`),
        file(`${other}-shm`)
      ]
    )

    expect(stale).toEqual([
      join(DATA, 'index', other),
      join(DATA, 'index', `${other}-wal`),
      join(DATA, 'index', `${other}-shm`)
    ])
  })

  it('selects nothing that is not exactly an index file', () => {
    const stale = selectStaleIndexFiles(
      DATA,
      current,
      [
        file('settings.json'),
        file('workspace.json'),
        file('index.db.bak'),
        file('Index.db'),
        file('index.db-journal'),
        notFile('index.db'),
        file('notes.db')
      ],
      [
        file('0123456789ABCDEF.db'),
        file('0123456789abcde.db'),
        file('0123456789abcdef0.db'),
        file('0123456789abcdef.db-journal'),
        file('0123456789abcdef.db.bak'),
        file('0123456789abcdeg.db'),
        file('README.txt'),
        notFile(other)
      ]
    )

    expect(stale).toEqual([])
  })

  it('does not select the current folder under an uppercase spelling of its name', () => {
    const upper = currentName.toUpperCase()

    expect(selectStaleIndexFiles(DATA, current, [], [file(upper)])).toEqual([])
  })
})

describe('removeStaleIndexFiles', () => {
  const current = indexLocationFor(DATA, '/synthetic/current', identity)

  function fileSystem(entries: Record<string, DirectoryEntry[]>): {
    system: IndexFileSystem
    removed: string[]
  } {
    const removed: string[] = []
    return {
      removed,
      system: {
        list: (directory) => {
          const found = entries[directory]
          if (!found) throw Object.assign(new Error('no folder'), { code: 'ENOENT' })
          return found
        },
        remove: (path) => {
          removed.push(path)
        }
      }
    }
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('deletes the selected files and reports that the legacy database was removed', () => {
    const { system, removed } = fileSystem({
      [DATA]: [file('index.db'), file('index.db-wal'), file('settings.json')],
      [current.directory]: [file(basename(current.path)), file('0123456789abcdef.db')]
    })

    const result = removeStaleIndexFiles(DATA, current, system)

    expect(removed).toEqual([
      join(DATA, 'index.db'),
      join(DATA, 'index.db-wal'),
      join(current.directory, '0123456789abcdef.db')
    ])
    expect(result.legacyRemoved).toBe(true)
  })

  it('reports no legacy removal when there was no legacy database', () => {
    const { system } = fileSystem({ [DATA]: [file('settings.json')] })

    expect(removeStaleIndexFiles(DATA, current, system).legacyRemoved).toBe(false)
  })

  it('does nothing when the folder could not be resolved', () => {
    const unresolved = indexLocationFor(DATA, '/synthetic/unmounted', () => {
      throw new Error('gone')
    })
    const { system, removed } = fileSystem({ [DATA]: [file('index.db')] })

    const result = removeStaleIndexFiles(DATA, unresolved, system)

    expect(removed).toEqual([])
    expect(result.legacyRemoved).toBe(false)
  })

  it('carries on, and logs only the code, when a deletion fails', () => {
    const removed: string[] = []
    const system: IndexFileSystem = {
      list: (directory) => (directory === DATA ? [file('index.db'), file('index.db-wal')] : []),
      remove: (path) => {
        if (path.endsWith('index.db')) {
          throw Object.assign(new Error('EPERM: /Users/someone/secret-title.md'), {
            code: 'EPERM'
          })
        }
        removed.push(path)
      }
    }

    const result = removeStaleIndexFiles(DATA, current, system)

    expect(removed).toEqual([join(DATA, 'index.db-wal')])
    expect(result.legacyRemoved).toBe(false)
    expect(console.error).toHaveBeenCalledWith(expect.any(String), 'EPERM')
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret-title')
  })

  it('does not stop when a folder cannot be listed', () => {
    const system: IndexFileSystem = {
      list: () => {
        throw Object.assign(new Error('nope'), { code: 'EACCES' })
      },
      remove: () => {
        throw new Error('must not be called')
      }
    }

    expect(removeStaleIndexFiles(DATA, current, system).legacyRemoved).toBe(false)
    expect(console.error).toHaveBeenCalledWith(expect.any(String), 'EACCES')
  })
})

describe('removeStaleIndexFiles on a real file system', () => {
  let userData: string

  beforeEach(() => {
    userData = mkdtempSync(join(tmpdir(), 'ryte-index-cleanup-'))
  })

  afterEach(() => {
    rmSync(userData, { recursive: true, force: true })
  })

  it('removes the legacy trio and other folders, and leaves everything else', () => {
    const notes = join(userData, 'a-notes-folder')
    mkdirSync(notes)
    const current = indexLocationFor(userData, notes)
    mkdirSync(current.directory)
    const write = (path: string): void => writeFileSync(path, 'x')
    for (const name of ['index.db', 'index.db-wal', 'index.db-shm', 'settings.json']) {
      write(join(userData, name))
    }
    mkdirSync(join(userData, 'index.db-journal'))
    write(current.path)
    write(join(current.directory, '0123456789abcdef.db'))
    write(join(current.directory, 'README.txt'))
    mkdirSync(join(current.directory, 'fedcba9876543210.db'))
    symlinkSync(join(userData, 'settings.json'), join(current.directory, '1111111111111111.db'))

    const result = removeStaleIndexFiles(userData, current)

    expect(result.legacyRemoved).toBe(true)
    for (const gone of ['index.db', 'index.db-wal', 'index.db-shm']) {
      expect(existsSync(join(userData, gone))).toBe(false)
    }
    expect(existsSync(join(current.directory, '0123456789abcdef.db'))).toBe(false)
    expect(existsSync(current.path)).toBe(true)
    expect(existsSync(join(userData, 'settings.json'))).toBe(true)
    expect(existsSync(join(userData, 'index.db-journal'))).toBe(true)
    expect(existsSync(join(current.directory, 'README.txt'))).toBe(true)
    expect(existsSync(join(current.directory, 'fedcba9876543210.db'))).toBe(true)
    expect(existsSync(join(userData, 'settings.json'))).toBe(true)
    // The link to an unrelated file was left alone, and so was the file it points at.
    expect(existsSync(join(current.directory, '1111111111111111.db'))).toBe(true)
  })

  it('does nothing when the index folder does not exist yet', () => {
    const notes = join(userData, 'notes')
    mkdirSync(notes)
    writeFileSync(join(userData, 'settings.json'), 'x')

    expect(removeStaleIndexFiles(userData, indexLocationFor(userData, notes)).legacyRemoved).toBe(
      false
    )
    expect(existsSync(join(userData, 'settings.json'))).toBe(true)
  })
})
