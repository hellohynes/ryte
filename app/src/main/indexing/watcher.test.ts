import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A fake file system behind `node:fs` and `node:fs/promises`, so the watcher's decisions are tested without timing. The recursive
// watch listener is driven by hand; the scripted scenarios in `watcher.scenarios.test.ts` run the same watcher on a real folder.
const h = vi.hoisted(() => {
  type FakeKind = 'file' | 'dir' | 'link'
  const kinds = new Map<string, FakeKind>()
  const readdirFailures = new Map<string, string>()
  const aliases = new Map<string, string>()
  const linkTargets = new Map<string, string>()
  const gates = new Map<string, Promise<void>>()
  const staleGates = new Map<string, Promise<void>>()
  const inos = new Map<string, number>()
  const lstatFailures = new Map<string, string>()
  const lstatGates = new Map<string, Promise<void>>()
  const statGates = new Map<string, Promise<void>>()
  const lstatStats = { inflight: 0, max: 0 }
  const parent = (path: string): string => path.slice(0, path.lastIndexOf('/'))
  const fail = (code: string): Error =>
    Object.assign(new Error(`${code}: fake /notes/secret-title.md`), { code })
  const actual = (path: string): string => aliases.get(path) ?? path
  return {
    kinds,
    readdirFailures,
    aliases,
    linkTargets,
    gates,
    staleGates,
    inos,
    lstatFailures,
    lstatGates,
    statGates,
    lstatStats,
    watchFailure: { code: null as string | null },
    watch: vi.fn(),
    notifyFileChanged: vi.fn(),
    notifyFileRemoved: vi.fn(),
    lstat: vi.fn(async (path: string) => {
      lstatStats.inflight += 1
      lstatStats.max = Math.max(lstatStats.max, lstatStats.inflight)
      await Promise.resolve()
      lstatStats.inflight -= 1
      const failure = lstatFailures.get(path)
      if (failure) throw fail(failure)
      const kind = kinds.get(actual(path))
      // A slow stat: the answer is what the path was when the call began.
      const gate = lstatGates.get(path)
      if (gate) {
        lstatGates.delete(path)
        await gate
      }
      if (!kind) throw fail('ENOENT')
      return {
        ino: inos.get(path),
        isFile: () => kind === 'file',
        isDirectory: () => kind === 'dir',
        isSymbolicLink: () => kind === 'link'
      }
    }),
    // Follows a symbolic link, as the real call does.
    stat: vi.fn(async (path: string) => {
      const gate = statGates.get(path)
      if (gate) {
        statGates.delete(path)
        await gate
      }
      const kind = kinds.get(actual(linkTargets.get(path) ?? path))
      const resolved = linkTargets.has(path) ? 'dir' : kind
      if (!resolved) throw fail('ENOENT')
      return {
        ino: inos.get(path),
        isFile: () => resolved === 'file',
        isDirectory: () => resolved === 'dir',
        isSymbolicLink: () => false
      }
    }),
    readdir: vi.fn(async (dir: string) => {
      const gate = gates.get(dir)
      if (gate) await gate
      const code = readdirFailures.get(dir)
      if (code) throw fail(code)
      // Following a link reads its target.
      const target = linkTargets.get(dir) ?? dir
      if (kinds.get(target) !== 'dir') throw fail('ENOENT')
      const listing = [...kinds]
        .filter(([path]) => parent(path) === target)
        .map(([path, kind]) => ({
          name: path.slice(path.lastIndexOf('/') + 1),
          isFile: () => kind === 'file',
          isDirectory: () => kind === 'dir',
          isSymbolicLink: () => kind === 'link'
        }))
      // A slow read: the listing is what the folder held when the read began.
      const staleGate = staleGates.get(dir)
      if (staleGate) await staleGate
      return listing
    }),
    realpathNative: vi.fn(
      (path: string, callback: (error: Error | null, resolved?: string) => void) => {
        void Promise.resolve().then(() => {
          if (!kinds.has(actual(path))) callback(fail('ENOENT'))
          else callback(null, actual(path))
        })
      }
    ),
    parent,
    fail
  }
})

vi.mock('node:fs', () => ({
  watch: h.watch,
  realpath: { native: h.realpathNative }
}))
vi.mock('node:fs/promises', () => ({ lstat: h.lstat, readdir: h.readdir, stat: h.stat }))
vi.mock('./indexer-service', () => ({
  indexerService: {
    notifyFileChanged: h.notifyFileChanged,
    notifyFileRemoved: h.notifyFileRemoved
  }
}))

import { Watcher } from './watcher'

interface FakeWatch {
  root: string
  fsw: EventEmitter & { close: ReturnType<typeof vi.fn> }
  listener: (event: string, filename: string | null) => void
}

const ROOT = '/notes'
const DEBOUNCE = 300
let watches: FakeWatch[]
let consoleError: ReturnType<typeof vi.spyOn>

const ensureParents = (path: string): void => {
  for (let dir = h.parent(path); dir.length > ROOT.length; dir = h.parent(dir)) {
    if (!h.kinds.has(dir)) h.kinds.set(dir, 'dir')
  }
}
const fakeFs = {
  file: (path: string): void => {
    ensureParents(path)
    h.kinds.set(path, 'file')
  },
  dir: (path: string): void => {
    ensureParents(path)
    h.kinds.set(path, 'dir')
  },
  link: (path: string): void => {
    ensureParents(path)
    h.kinds.set(path, 'link')
  },
  remove: (path: string): void => {
    for (const key of [...h.kinds.keys()]) {
      if (key === path || key.startsWith(`${path}/`)) h.kinds.delete(key)
    }
  },
  move: (from: string, to: string): void => {
    for (const [key, kind] of [...h.kinds]) {
      if (key === from || key.startsWith(`${from}/`)) {
        h.kinds.delete(key)
        h.kinds.set(to + key.slice(from.length), kind)
      }
    }
  }
}

const drain = async (): Promise<void> => {
  for (let i = 0; i < 50; i += 1) await Promise.resolve()
}
const advance = async (ms: number): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms)
  await drain()
}
const emit = (filename: string | null, index = watches.length - 1): void => {
  watches[index]?.listener('rename', filename)
}

interface Booted {
  watcher: Watcher
  tree: ReturnType<typeof vi.fn>
  catalog: ReturnType<typeof vi.fn>
}

async function boot(root = ROOT): Promise<Booted> {
  const watcher = new Watcher()
  const tree = vi.fn()
  const catalog = vi.fn()
  watcher.onTreeChanged(tree)
  watcher.onCatalogChanged(catalog)
  watcher.start(root)
  await advance(0)
  return { watcher, tree, catalog }
}

const upsert = (path: string, notesRoot = ROOT): unknown => ({ type: 'upsert', path, notesRoot })
const remove = (path: string, notesRoot = ROOT): unknown => ({ type: 'remove', path, notesRoot })
const catalogPaths = (catalog: ReturnType<typeof vi.fn>, type: 'upsert' | 'remove'): string[] =>
  catalog.mock.calls
    .map(([event]) => event as { type: string; path: string })
    .filter((event) => event.type === type)
    .map((event) => event.path)
    .sort()

describe('Watcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    h.kinds.clear()
    h.kinds.set(ROOT, 'dir')
    h.readdirFailures.clear()
    h.aliases.clear()
    h.linkTargets.clear()
    h.gates.clear()
    h.staleGates.clear()
    h.inos.clear()
    h.lstatFailures.clear()
    h.lstatGates.clear()
    h.statGates.clear()
    h.lstatStats.inflight = 0
    h.lstatStats.max = 0
    h.watchFailure.code = null
    watches = []
    h.watch.mockImplementation(
      (root: string, _options: unknown, listener: FakeWatch['listener']) => {
        if (h.watchFailure.code) throw h.fail(h.watchFailure.code)
        const fsw = Object.assign(new EventEmitter(), { close: vi.fn() })
        watches.push({ root, fsw, listener })
        return fsw
      }
    )
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    consoleError.mockRestore()
  })

  describe('what it reports', () => {
    it('notifies the indexer and file tree subscribers when a markdown file is added', async () => {
      const { tree, catalog } = await boot()
      expect(h.watch).toHaveBeenCalledWith(
        ROOT,
        expect.objectContaining({ recursive: true }),
        expect.any(Function)
      )

      fakeFs.file('/notes/new.md')
      emit('new.md')
      await advance(DEBOUNCE)

      expect(tree).toHaveBeenCalledOnce()
      expect(catalog).toHaveBeenCalledWith(upsert('/notes/new.md'))
      expect(h.notifyFileChanged).toHaveBeenCalledWith('/notes/new.md')
    })

    it('ignores non-markdown files', async () => {
      const { tree, catalog } = await boot()

      fakeFs.file('/notes/ignored.txt')
      emit('ignored.txt')
      fakeFs.file('/notes/.n.md.tmp')
      emit('.n.md.tmp')
      await advance(DEBOUNCE)

      expect(tree).not.toHaveBeenCalled()
      expect(catalog).not.toHaveBeenCalled()
      expect(h.notifyFileChanged).not.toHaveBeenCalled()
      expect(h.notifyFileRemoved).not.toHaveBeenCalled()
    })

    it('notifies the indexer and file tree subscribers when a markdown file is removed', async () => {
      fakeFs.file('/notes/old.md')
      const { tree, catalog } = await boot()

      fakeFs.remove('/notes/old.md')
      emit('old.md')
      await advance(DEBOUNCE)

      expect(tree).toHaveBeenCalledOnce()
      expect(catalog).toHaveBeenCalledWith(remove('/notes/old.md'))
      expect(h.notifyFileRemoved).toHaveBeenCalledWith('/notes/old.md')
    })

    it('notifies the file tree but not the catalog when folders are added or removed', async () => {
      fakeFs.dir('/notes/old-folder')
      const { tree, catalog } = await boot()

      fakeFs.dir('/notes/new-folder')
      emit('new-folder')
      await advance(DEBOUNCE)
      expect(tree).toHaveBeenCalledTimes(1)

      fakeFs.remove('/notes/old-folder')
      emit('old-folder')
      await advance(DEBOUNCE)
      expect(tree).toHaveBeenCalledTimes(2)
      expect(catalog).not.toHaveBeenCalled()
    })

    it('emits the catalog but not the file tree for a content-only change', async () => {
      fakeFs.file('/notes/existing.md')
      const { tree, catalog } = await boot()

      emit('existing.md')
      await advance(DEBOUNCE)

      expect(tree).not.toHaveBeenCalled()
      expect(catalog).toHaveBeenCalledWith(upsert('/notes/existing.md'))
      expect(h.notifyFileChanged).toHaveBeenCalledWith('/notes/existing.md')
    })

    it('decides a path once, after its events stop, however many arrive', async () => {
      fakeFs.file('/notes/existing.md')
      const { catalog } = await boot()

      for (let i = 0; i < 50; i += 1) {
        emit('existing.md')
        await advance(DEBOUNCE - 50)
      }
      expect(catalog).not.toHaveBeenCalled()
      await advance(DEBOUNCE)

      expect(catalog).toHaveBeenCalledTimes(1)
      expect(h.notifyFileChanged).toHaveBeenCalledTimes(1)
    })

    it('serializes index operations and coalesces repeats for one note', async () => {
      fakeFs.file('/notes/existing.md')
      let release!: () => void
      h.notifyFileChanged.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve
          })
      )
      await boot()

      emit('existing.md')
      await advance(DEBOUNCE)
      emit('existing.md')
      await advance(DEBOUNCE)
      emit('existing.md')
      await advance(DEBOUNCE)
      expect(h.notifyFileChanged).toHaveBeenCalledTimes(1)

      release()
      await advance(0)
      expect(h.notifyFileChanged).toHaveBeenCalledTimes(2)
    })

    it('ignores a temporary markdown file that is gone before it is decided', async () => {
      fakeFs.file('/notes/n.md')
      const { tree, catalog } = await boot()

      fakeFs.file('/notes/n.tmp.md')
      emit('n.tmp.md')
      fakeFs.move('/notes/n.tmp.md', '/notes/n.md')
      emit('n.tmp.md')
      emit('n.md')
      await advance(DEBOUNCE)

      expect(catalogPaths(catalog, 'upsert')).toEqual(['/notes/n.md'])
      expect(catalogPaths(catalog, 'remove')).toEqual([])
      expect(tree).not.toHaveBeenCalled()
    })

    it('stamps every event with the notes root it was started with', async () => {
      fakeFs.file('/notes/a.md')
      const { catalog } = await boot()
      emit('a.md')
      await advance(DEBOUNCE)
      expect(
        catalog.mock.calls.every(([event]) => (event as { notesRoot: string }).notesRoot === ROOT)
      ).toBe(true)
    })
  })

  describe('a folder changes without an event for what is inside', () => {
    it('indexes the notes of a folder that appears with them', async () => {
      const { tree, catalog } = await boot()

      fakeFs.file('/notes/z/b/n1.md')
      fakeFs.file('/notes/z/n2.md')
      fakeFs.file('/notes/z/pic.png')
      emit('z')
      await advance(DEBOUNCE)

      expect(catalogPaths(catalog, 'upsert')).toEqual(['/notes/z/b/n1.md', '/notes/z/n2.md'])
      expect(tree).toHaveBeenCalledOnce()
    })

    it('removes the notes of a folder that was deleted, from the one event for the folder', async () => {
      fakeFs.file('/notes/d/e/n.md')
      fakeFs.file('/notes/d/p.png')
      const { tree, catalog } = await boot()

      fakeFs.remove('/notes/d')
      emit('d')
      await advance(DEBOUNCE)

      expect(catalogPaths(catalog, 'remove')).toEqual(['/notes/d/e/n.md'])
      expect(h.notifyFileRemoved).toHaveBeenCalledWith('/notes/d/e/n.md')
      expect(tree).toHaveBeenCalled()
    })

    it('moves the notes of a moved folder: the old paths go and the new ones arrive', async () => {
      fakeFs.file('/notes/a/b/n1.md')
      fakeFs.file('/notes/a/n2.md')
      const { catalog } = await boot()

      fakeFs.move('/notes/a', '/notes/z')
      emit('a')
      emit('z')
      await advance(DEBOUNCE)

      expect(catalogPaths(catalog, 'remove')).toEqual(['/notes/a/b/n1.md', '/notes/a/n2.md'])
      expect(catalogPaths(catalog, 'upsert')).toEqual(['/notes/z/b/n1.md', '/notes/z/n2.md'])
    })

    it('removes the notes of a folder that was replaced by a file', async () => {
      fakeFs.file('/notes/f/n.md')
      fakeFs.file('/notes/f/m.md')
      const { catalog } = await boot()

      fakeFs.remove('/notes/f')
      fakeFs.file('/notes/f')
      emit('f')
      await advance(DEBOUNCE)

      expect(catalogPaths(catalog, 'remove')).toEqual(['/notes/f/m.md', '/notes/f/n.md'])
      expect(catalogPaths(catalog, 'upsert')).toEqual([])
    })

    it('a folder replaced by a markdown file is one note and no folder', async () => {
      fakeFs.file('/notes/f.md/n.md')
      const { catalog } = await boot()

      fakeFs.remove('/notes/f.md')
      fakeFs.file('/notes/f.md')
      emit('f.md')
      await advance(DEBOUNCE)

      expect(catalogPaths(catalog, 'remove')).toEqual(['/notes/f.md/n.md'])
      expect(catalogPaths(catalog, 'upsert')).toEqual(['/notes/f.md'])
    })

    it('a note replaced by a folder of the same name drops the note and finds the notes inside', async () => {
      fakeFs.file('/notes/x.md')
      const { catalog } = await boot()

      fakeFs.remove('/notes/x.md')
      fakeFs.file('/notes/x.md/inner.md')
      emit('x.md')
      await advance(DEBOUNCE)

      expect(catalogPaths(catalog, 'remove')).toEqual(['/notes/x.md'])
      expect(catalogPaths(catalog, 'upsert')).toEqual(['/notes/x.md/inner.md'])
    })

    it('reconciles a folder renamed onto an existing empty folder', async () => {
      fakeFs.file('/notes/g1/n.md')
      fakeFs.dir('/notes/g2')
      const { catalog } = await boot()

      fakeFs.remove('/notes/g2')
      fakeFs.move('/notes/g1', '/notes/g2')
      emit('g1')
      emit('g2')
      await advance(DEBOUNCE)

      expect(catalogPaths(catalog, 'remove')).toEqual(['/notes/g1/n.md'])
      expect(catalogPaths(catalog, 'upsert')).toEqual(['/notes/g2/n.md'])
    })

    it('drops the notes of a folder that vanishes while its subtree is read', async () => {
      fakeFs.file('/notes/x/n.md')
      const { catalog } = await boot()

      // The folder is still there for the check and gone when it is read.
      h.readdirFailures.set('/notes/x', 'ENOENT')
      emit('x')
      await advance(DEBOUNCE)

      expect(catalogPaths(catalog, 'remove')).toEqual(['/notes/x/n.md'])
      expect(consoleError).not.toHaveBeenCalled()
    })

    it('drops the notes of a folder only its notes were known for', async () => {
      const { catalog } = await boot()
      fakeFs.file('/notes/late/n.md')
      emit('late/n.md')
      await advance(DEBOUNCE)
      expect(catalogPaths(catalog, 'upsert')).toEqual(['/notes/late/n.md'])

      fakeFs.remove('/notes/late')
      emit('late')
      await advance(DEBOUNCE)

      expect(catalogPaths(catalog, 'remove')).toEqual(['/notes/late/n.md'])
    })
  })

  describe('names and links', () => {
    it('treats the old name of a case-only rename as removed and the new name as added', async () => {
      fakeFs.file('/notes/n.md')
      const { catalog } = await boot()

      fakeFs.move('/notes/n.md', '/notes/N.md')
      h.aliases.set('/notes/n.md', '/notes/N.md')
      emit('n.md')
      emit('N.md')
      await advance(DEBOUNCE)

      expect(catalogPaths(catalog, 'remove')).toEqual(['/notes/n.md'])
      expect(catalogPaths(catalog, 'upsert')).toEqual(['/notes/N.md'])
    })

    it('ignores a symbolic link and does not walk it', async () => {
      fakeFs.file('/outside/linked/n.md')
      fakeFs.link('/notes/link')
      h.linkTargets.set('/notes/link', '/outside/linked')
      const { tree, catalog } = await boot()

      emit('link')
      emit('link/n.md')
      await advance(DEBOUNCE)

      expect(catalog).not.toHaveBeenCalled()
      expect(tree).not.toHaveBeenCalled()
    })

    it('drops a known note that was replaced by a symbolic link', async () => {
      fakeFs.file('/notes/n.md')
      const { catalog } = await boot()

      fakeFs.remove('/notes/n.md')
      fakeFs.link('/notes/n.md')
      emit('n.md')
      await advance(DEBOUNCE)

      expect(catalogPaths(catalog, 'remove')).toEqual(['/notes/n.md'])
    })
  })

  describe('start-up', () => {
    it('holds events that arrive during the first walk and decides them when it ends', async () => {
      let open!: () => void
      h.gates.set(ROOT, new Promise<void>((resolve) => (open = resolve)))
      const watcher = new Watcher()
      const tree = vi.fn()
      const catalog = vi.fn()
      watcher.onTreeChanged(tree)
      watcher.onCatalogChanged(catalog)
      watcher.start(ROOT)
      fakeFs.file('/notes/during.md')
      emit('during.md')
      await advance(DEBOUNCE * 2)
      expect(catalog).not.toHaveBeenCalled()

      open()
      await advance(0)

      expect(catalog).toHaveBeenCalledTimes(1)
      expect(catalog).toHaveBeenCalledWith(upsert('/notes/during.md'))
      expect(tree).toHaveBeenCalledOnce()
    })

    it('becomes ready and releases held events although one folder cannot be read', async () => {
      fakeFs.file('/notes/locked/secret-title.md')
      h.readdirFailures.set('/notes/locked', 'EACCES')
      const { catalog } = await boot()

      fakeFs.file('/notes/ok.md')
      emit('ok.md')
      await advance(DEBOUNCE)

      expect(catalogPaths(catalog, 'upsert')).toEqual(['/notes/ok.md'])
      expect(consoleError).toHaveBeenCalledWith(expect.any(String), 'EACCES')
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('secret-title')
    })

    it('stays stopped when the folder cannot be read, and reports the code only', async () => {
      h.readdirFailures.set(ROOT, 'EACCES')
      const { catalog } = await boot()

      fakeFs.file('/notes/a.md')
      emit('a.md')
      await advance(DEBOUNCE)

      expect(catalog).not.toHaveBeenCalled()
      expect(watches[0]?.fsw.close).toHaveBeenCalledOnce()
      expect(consoleError).toHaveBeenCalledWith(expect.any(String), 'EACCES')
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('secret-title')
    })

    it('does not throw when the folder is missing, stays stopped, and starts again on the next start', async () => {
      h.watchFailure.code = 'ENOENT'
      const watcher = new Watcher()
      const catalog = vi.fn()
      watcher.onCatalogChanged(catalog)

      expect(() => watcher.start('/missing')).not.toThrow()
      await expect(watcher.stop()).resolves.toBeUndefined()
      expect(consoleError).toHaveBeenCalledWith(expect.any(String), 'ENOENT')

      h.watchFailure.code = null
      watcher.start(ROOT)
      await advance(0)
      fakeFs.file('/notes/a.md')
      emit('a.md')
      await advance(DEBOUNCE)
      expect(catalog).toHaveBeenCalledWith(upsert('/notes/a.md'))
    })
  })

  describe('errors', () => {
    it('reports a tree change and restarts once when the watcher fails', async () => {
      fakeFs.file('/notes/a.md')
      const { tree, catalog } = await boot()

      watches[0]?.fsw.emit(
        'error',
        Object.assign(new Error('boom /notes/secret-title.md'), { code: 'EMFILE' })
      )
      await advance(0)

      expect(tree).toHaveBeenCalledOnce()
      expect(watches).toHaveLength(2)
      expect(watches[0]?.fsw.close).toHaveBeenCalledOnce()
      expect(consoleError).toHaveBeenCalledWith(expect.any(String), 'EMFILE')
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('secret-title')

      fakeFs.file('/notes/b.md')
      emit('b.md')
      await advance(DEBOUNCE)
      expect(catalogPaths(catalog, 'upsert')).toEqual(['/notes/b.md'])
    })

    it('does not restart a second time, and does not throw', async () => {
      await boot()
      watches[0]?.fsw.emit('error', Object.assign(new Error('first'), { code: 'EMFILE' }))
      await advance(0)
      expect(() =>
        watches[1]?.fsw.emit('error', Object.assign(new Error('second'), { code: 'EMFILE' }))
      ).not.toThrow()
      await advance(0)

      expect(watches).toHaveLength(2)
      expect(watches[1]?.fsw.close).toHaveBeenCalledOnce()
    })

    it('tries a path it cannot read again, then reports it', async () => {
      const { catalog } = await boot()
      h.lstat.mockRejectedValueOnce(h.fail('EACCES'))

      fakeFs.file('/notes/a.md')
      emit('a.md')
      await advance(DEBOUNCE)
      expect(catalog).not.toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalledWith(expect.any(String), 'EACCES')

      await advance(1000)
      expect(catalogPaths(catalog, 'upsert')).toEqual(['/notes/a.md'])
    })

    it('gives up on a path that stays unreadable after two more tries', async () => {
      const { catalog } = await boot()
      for (let i = 0; i < 3; i += 1) h.lstat.mockRejectedValueOnce(h.fail('EACCES'))
      fakeFs.file('/notes/a.md')
      emit('a.md')

      await advance(DEBOUNCE + 1000 + 2000 + 3000)

      expect(catalog).not.toHaveBeenCalled()
      expect(consoleError.mock.calls.filter(([, code]) => code === 'EACCES')).toHaveLength(3)
    })

    it('carries on when a listener throws', async () => {
      const { watcher, catalog } = await boot()
      watcher.onTreeChanged(() => {
        throw new Error('window is gone /notes/secret-title.md')
      })

      fakeFs.file('/notes/a.md')
      emit('a.md')
      await advance(DEBOUNCE)
      fakeFs.file('/notes/b.md')
      emit('b.md')
      await advance(DEBOUNCE)

      expect(catalogPaths(catalog, 'upsert')).toEqual(['/notes/a.md', '/notes/b.md'])
      expect(consoleError).toHaveBeenCalledWith(
        'Ryte could not notify a file tree listener.',
        'UNKNOWN'
      )
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('secret-title')
    })

    it('may restart again after it has run for a minute', async () => {
      await boot()
      watches[0]?.fsw.emit('error', Object.assign(new Error('first'), { code: 'EMFILE' }))
      await advance(0)
      expect(watches).toHaveLength(2)

      await advance(60_000)
      watches[1]?.fsw.emit('error', Object.assign(new Error('second'), { code: 'EMFILE' }))
      await advance(0)

      expect(watches).toHaveLength(3)
    })
  })

  describe('a folder walk that is slow, or cannot read everything', () => {
    it('keeps a note saved while the folder was being read', async () => {
      const { catalog } = await boot()
      fakeFs.file('/notes/D/sub/a.md')
      let release!: () => void
      h.staleGates.set('/notes/D/sub', new Promise<void>((resolve) => (release = resolve)))

      emit('D')
      await advance(DEBOUNCE)
      fakeFs.file('/notes/D/sub/late.md')
      emit('D/sub/late.md')
      await advance(DEBOUNCE)
      expect(catalogPaths(catalog, 'upsert')).toEqual(['/notes/D/sub/late.md'])

      release()
      await advance(0)
      expect(catalogPaths(catalog, 'remove')).toEqual([])
      expect(h.notifyFileRemoved).not.toHaveBeenCalled()
      expect(catalogPaths(catalog, 'upsert')).toEqual(['/notes/D/sub/a.md', '/notes/D/sub/late.md'])
    })

    it('keeps a known note that was saved again while its folder was being read', async () => {
      fakeFs.file('/notes/D/sub/a.md')
      const { catalog } = await boot()
      let release!: () => void
      h.staleGates.set('/notes/D/sub', new Promise<void>((resolve) => (release = resolve)))
      // The folder is reported while the walk of it is slow, and a second note appears in it meanwhile.
      emit('D')
      await advance(DEBOUNCE)
      fakeFs.file('/notes/D/sub/b.md')
      emit('D/sub/b.md')
      await advance(DEBOUNCE)
      emit('D')
      await advance(DEBOUNCE)
      release()
      await advance(0)

      expect(catalogPaths(catalog, 'remove')).toEqual([])
    })

    it('does not add a note that was deleted while the folder was being read', async () => {
      const { catalog } = await boot()
      fakeFs.file('/notes/D/sub/gone.md')
      let release!: () => void
      h.staleGates.set('/notes/D/sub', new Promise<void>((resolve) => (release = resolve)))

      emit('D')
      await advance(DEBOUNCE)
      fakeFs.remove('/notes/D/sub/gone.md')
      emit('D/sub/gone.md')
      await advance(DEBOUNCE)
      release()
      await advance(0)

      expect(catalogPaths(catalog, 'upsert')).toEqual([])
    })

    it('keeps the known notes of a subfolder it could not read', async () => {
      fakeFs.file('/notes/p/sub/n.md')
      fakeFs.file('/notes/p/other.md')
      const { catalog } = await boot()

      h.readdirFailures.set('/notes/p/sub', 'EACCES')
      emit('p')
      await advance(DEBOUNCE)

      expect(catalogPaths(catalog, 'remove')).toEqual([])
      expect(consoleError).toHaveBeenCalledWith(expect.any(String), 'EACCES')
    })

    it('keeps a known note it cannot check, as it cannot tell whether it is gone', async () => {
      fakeFs.file('/notes/p/sub/n.md')
      const { catalog } = await boot()

      h.readdirFailures.set('/notes/p/sub', 'EACCES')
      h.lstatFailures.set('/notes/p/sub/n.md', 'EACCES')
      emit('p')
      await advance(DEBOUNCE)

      expect(catalogPaths(catalog, 'remove')).toEqual([])
    })

    it('does not add a note that was deleted after the walk checked it', async () => {
      const { catalog } = await boot()
      fakeFs.file('/notes/d2/x.md')
      let release!: () => void
      h.lstatGates.set('/notes/d2/x.md', new Promise<void>((resolve) => (release = resolve)))

      emit('d2')
      await advance(DEBOUNCE)
      fakeFs.remove('/notes/d2/x.md')
      emit('d2/x.md')
      await advance(DEBOUNCE)
      release()
      await advance(0)

      expect(catalogPaths(catalog, 'upsert')).toEqual([])
      expect(h.notifyFileChanged).not.toHaveBeenCalled()
    })

    it('still removes a known note that is really gone from a folder it walked', async () => {
      fakeFs.file('/notes/p/n.md')
      fakeFs.file('/notes/p/m.md')
      const { catalog } = await boot()

      fakeFs.remove('/notes/p/n.md')
      emit('p')
      await advance(DEBOUNCE)

      expect(catalogPaths(catalog, 'remove')).toEqual(['/notes/p/n.md'])
    })
  })

  describe('cost', () => {
    it('does not scan the known notes for a deleted path that held none', async () => {
      for (let i = 0; i < 2000; i += 1) fakeFs.file(`/notes/d${i % 50}/n${i}.md`)
      await boot()
      fakeFs.file('/notes/d1/pic.png')
      fakeFs.file('/notes/d1/.n.tmp')
      emit('d1/pic.png')
      emit('d1/.n.tmp')
      await advance(DEBOUNCE)

      fakeFs.remove('/notes/d1/pic.png')
      fakeFs.remove('/notes/d1/.n.tmp')
      const startsWith = vi.spyOn(String.prototype, 'startsWith')
      emit('d1/pic.png')
      emit('d1/.n.tmp')
      emit('never/existed.md')
      await advance(DEBOUNCE)
      const calls = startsWith.mock.calls.length
      startsWith.mockRestore()

      expect(calls).toBeLessThan(50)
    })
  })

  describe('the folder itself is lost', () => {
    it('removes everything known when the folder is deleted, though no event arrived', async () => {
      fakeFs.file('/notes/a.md')
      fakeFs.file('/notes/sub/b.md')
      const { catalog, tree } = await boot()

      fakeFs.remove(ROOT)
      await advance(5000)

      expect(catalogPaths(catalog, 'remove')).toEqual(['/notes/a.md', '/notes/sub/b.md'])
      expect(h.notifyFileRemoved).toHaveBeenCalledWith('/notes/a.md')
      expect(tree).toHaveBeenCalled()
      expect(watches[0]?.fsw.close).toHaveBeenCalledOnce()
    })

    it('starts watching again when the folder comes back', async () => {
      fakeFs.file('/notes/a.md')
      const { catalog } = await boot()
      fakeFs.remove(ROOT)
      await advance(5000)
      expect(watches).toHaveLength(1)

      h.kinds.set(ROOT, 'dir')
      fakeFs.file('/notes/a.md')
      await advance(5000)
      expect(watches).toHaveLength(2)
      // The folder's notes were reported removed, so they are reported again.
      expect(catalogPaths(catalog, 'upsert')).toEqual(['/notes/a.md'])
      expect(h.notifyFileChanged).toHaveBeenCalledWith('/notes/a.md')

      fakeFs.file('/notes/new.md')
      emit('new.md')
      await advance(DEBOUNCE)
      expect(catalogPaths(catalog, 'upsert')).toEqual(['/notes/a.md', '/notes/new.md'])
    })

    it('treats a folder replaced by another at the same path as lost and watches the new one', async () => {
      fakeFs.file('/notes/a.md')
      h.inos.set(ROOT, 1)
      const { catalog } = await boot()

      h.inos.set(ROOT, 2)
      await advance(5000)
      expect(catalogPaths(catalog, 'remove')).toEqual(['/notes/a.md'])
      await advance(5000)
      expect(watches).toHaveLength(2)
    })

    it('does not treat a notes folder that is a symbolic link as lost', async () => {
      fakeFs.file('/real/a.md')
      h.kinds.set('/real', 'dir')
      h.kinds.set(ROOT, 'link')
      h.linkTargets.set(ROOT, '/real')
      h.inos.set(ROOT, 7)
      const { catalog } = await boot()

      await advance(30_000)

      expect(catalog).not.toHaveBeenCalled()
      expect(watches).toHaveLength(1)
      expect(watches[0]?.fsw.close).not.toHaveBeenCalled()
    })

    it('watches a folder that was missing at start once it appears, and reports its notes', async () => {
      h.watchFailure.code = 'ENOENT'
      const watcher = new Watcher()
      const catalog = vi.fn()
      watcher.onCatalogChanged(catalog)
      watcher.start(ROOT)
      await advance(0)
      expect(watches).toHaveLength(0)

      h.watchFailure.code = null
      fakeFs.file('/notes/a.md')
      await advance(5000)

      expect(watches).toHaveLength(1)
      expect(catalogPaths(catalog, 'upsert')).toEqual(['/notes/a.md'])
    })

    it('does not open the old folder when a stale check of it finishes after a new start', async () => {
      fakeFs.file('/notes/a.md')
      fakeFs.dir('/other')
      const { watcher } = await boot()
      fakeFs.remove(ROOT)
      await advance(5000)

      h.kinds.set(ROOT, 'dir')
      let release!: () => void
      h.statGates.set(ROOT, new Promise<void>((resolve) => (release = resolve)))
      await advance(5000)
      watcher.start('/other')
      await advance(0)
      // The new folder is lost too, so nothing but the stale check could open a watcher.
      fakeFs.remove('/other')
      await advance(5000)
      release()
      await advance(0)

      expect(watches.map((w) => w.root)).toEqual([ROOT, '/other'])
    })

    it('stop ends the wait for a lost folder', async () => {
      fakeFs.file('/notes/a.md')
      const { watcher } = await boot()
      fakeFs.remove(ROOT)
      await advance(5000)
      await watcher.stop()

      h.kinds.set(ROOT, 'dir')
      await advance(20_000)
      expect(watches).toHaveLength(1)
    })
  })

  describe('lifecycle', () => {
    it('reports nothing after stop, even for events and timers already pending', async () => {
      fakeFs.file('/notes/a.md')
      const { watcher, catalog, tree } = await boot()

      emit('a.md')
      await watcher.stop()
      emit('a.md')
      await advance(DEBOUNCE * 2)

      expect(catalog).not.toHaveBeenCalled()
      expect(tree).not.toHaveBeenCalled()
      expect(h.notifyFileChanged).not.toHaveBeenCalled()
    })

    it('stop twice, or before start, is harmless', async () => {
      const watcher = new Watcher()
      await expect(watcher.stop()).resolves.toBeUndefined()
      watcher.start(ROOT)
      await advance(0)
      await watcher.stop()
      await expect(watcher.stop()).resolves.toBeUndefined()
      expect(watches[0]?.fsw.close).toHaveBeenCalledOnce()
    })

    it('stop resolves at once, however many folders there are', async () => {
      for (let i = 0; i < 2000; i += 1) fakeFs.file(`/notes/d${i}/n.md`)
      const { watcher } = await boot()
      let done = false
      void watcher.stop().then(() => {
        done = true
      })
      await Promise.resolve()
      await Promise.resolve()
      expect(done).toBe(true)
    })

    it('start twice closes the first watcher and keeps only the second', async () => {
      const { watcher, catalog } = await boot('/notes')
      fakeFs.file('/other/b.md')
      h.kinds.set('/other', 'dir')
      watcher.start('/other')
      await advance(0)

      expect(watches).toHaveLength(2)
      expect(watches[0]?.fsw.close).toHaveBeenCalledOnce()

      fakeFs.file('/notes/a.md')
      emit('a.md', 0)
      emit('b.md', 1)
      await advance(DEBOUNCE)
      expect(catalog.mock.calls.map(([event]) => event)).toEqual([upsert('/other/b.md', '/other')])
    })

    it('does not let an old start-up walk finish into the new watcher', async () => {
      let open!: () => void
      h.gates.set(ROOT, new Promise<void>((resolve) => (open = resolve)))
      const watcher = new Watcher()
      const catalog = vi.fn()
      watcher.onCatalogChanged(catalog)
      watcher.start(ROOT)
      emit('stale.md')
      fakeFs.file('/notes/stale.md')
      await watcher.stop()
      open()
      await advance(DEBOUNCE * 2)

      expect(catalog).not.toHaveBeenCalled()
    })

    it('decides at most 64 paths at a time, and decides all of them', async () => {
      const { catalog } = await boot()
      for (let i = 0; i < 300; i += 1) {
        fakeFs.file(`/notes/n${i}.md`)
        emit(`n${i}.md`)
      }
      // All 300 timers fire in one tick, so every decision is due at once.
      vi.advanceTimersByTime(DEBOUNCE)
      await advance(0)

      expect(catalog).toHaveBeenCalledTimes(300)
      expect(h.lstatStats.max).toBeLessThanOrEqual(64)
    })
  })
})
