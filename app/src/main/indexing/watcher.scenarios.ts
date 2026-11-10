// Scripted file-system changes for the notes watcher, and a runner that reduces what the watcher reported to a canonical form.
// The expected reductions in `watcher.scenarios.expected.json` were recorded once from the chokidar-based watcher, three times in a
// row and identical, before it was replaced; they are the oracle for any watcher implementation. Do not derive them from new code.
//
// Chokidar's event order and timing vary between identical runs, so nothing here compares a raw sequence. A reduction keeps, per
// scenario: whether the file tree was reported changed at all, the last operation reported for each path to the catalog and to the
// indexer, and (for bursts only) a bound on the number of index calls.
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

export interface CatalogEventLike {
  type: 'upsert' | 'remove'
  path: string
  notesRoot: string
}

export interface WatcherLike {
  start(notesRoot: string): void
  stop(): Promise<void>
  onTreeChanged(cb: () => void): () => void
  onCatalogChanged(cb: (event: CatalogEventLike) => void): () => void
}

export interface IndexCall {
  op: 'changed' | 'removed'
  path: string
}

export interface Reduction {
  /** The file tree was reported changed at least once. */
  tree: boolean
  /** The last operation reported to the catalog for each relative path, sorted by path. */
  catalog: Array<[string, 'upsert' | 'remove']>
  /** The last operation applied to the index for each relative path, sorted by path. */
  index: Array<[string, 'changed' | 'removed']>
  /** Every catalog event carried the notes root the watcher was started with. */
  rootOnEveryEvent: boolean
  /** The harness gave up waiting for quiet after the cap, so the reduction may be incomplete. */
  cappedBeforeQuiet: boolean
}

export interface Scenario {
  id: string
  description: string
  /** Not asserted against the oracle: the scenario documents a difference the plan decided on purpose. */
  informational?: boolean
  /** For bursts: the most index calls any implementation may make. Other scenarios do not bound the count. */
  maxIndexCalls?: number
  /** Runs before the watcher starts, so it is already on disk when watching begins. */
  setup?: (root: string, outside: string) => void
  /** Runs after the watcher is ready. */
  act: (root: string, outside: string) => void | Promise<void>
}

const write = (path: string, text = '# note\n'): void => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export const scenarios: Scenario[] = []
const add = (scenario: Scenario): void => {
  scenarios.push(scenario)
}

add({
  id: 'create-markdown',
  description: 'a new markdown file',
  act: (root) => write(join(root, 'a.md'))
})
add({
  id: 'edit-markdown',
  description: 'a markdown file edited in place',
  setup: (root) => write(join(root, 'a.md')),
  act: (root) => write(join(root, 'a.md'), '# edited\n')
})
add({
  id: 'delete-markdown',
  description: 'a markdown file deleted',
  setup: (root) => write(join(root, 'a.md')),
  act: (root) => rmSync(join(root, 'a.md'))
})
add({
  id: 'create-non-markdown',
  description: 'non-markdown files, which are ignored',
  act: (root) => {
    write(join(root, 'pic.bin'), 'x')
    write(join(root, 'b.txt'), 'x')
  }
})
add({
  id: 'create-nested-folder-with-notes',
  description: 'a nested folder holding two notes and an image',
  act: (root) => {
    write(join(root, 'f', 'g', 'n1.md'))
    write(join(root, 'f', 'g', 'n2.md'))
    write(join(root, 'f', 'g', 'pic.bin'), 'x')
  }
})
add({
  id: 'edit-nested-note',
  description: 'a note in a nested folder edited in place',
  setup: (root) => write(join(root, 'f', 'g', 'n1.md')),
  act: (root) => write(join(root, 'f', 'g', 'n1.md'), '# edited\n')
})
add({
  id: 'atomic-save-dot-tmp',
  description: 'an atomic save through a hidden temporary file that does not end in .md',
  setup: (root) => write(join(root, 'n.md')),
  act: (root) => {
    write(join(root, '.n.md.tmp'), '# v2\n')
    renameSync(join(root, '.n.md.tmp'), join(root, 'n.md'))
  }
})
add({
  id: 'atomic-save-md-tmp',
  description: 'an atomic save through a temporary file that ends in .md',
  setup: (root) => write(join(root, 'n.md')),
  act: (root) => {
    write(join(root, 'n.tmp.md'), '# v2\n')
    renameSync(join(root, 'n.tmp.md'), join(root, 'n.md'))
  }
})
add({
  id: 'atomic-save-slow-dot-tmp',
  description:
    'an atomic save whose hidden temporary file (not .md) stays on disk for half a second before the rename',
  setup: (root) => write(join(root, 'n.md')),
  act: async (root) => {
    write(join(root, '.n.md.tmp'), '# v2\n')
    await sleep(500)
    renameSync(join(root, '.n.md.tmp'), join(root, 'n.md'))
  }
})
add({
  id: 'atomic-save-slow-md-tmp',
  description:
    'an atomic save whose temporary file ends in .md and stays on disk for half a second, so it really exists as a note',
  setup: (root) => write(join(root, 'n.md')),
  act: async (root) => {
    write(join(root, 'n.tmp.md'), '# v2\n')
    await sleep(500)
    renameSync(join(root, 'n.tmp.md'), join(root, 'n.md'))
  }
})
add({
  id: 'rename-note',
  description: 'a note renamed',
  setup: (root) => write(join(root, 'a.md')),
  act: (root) => {
    renameSync(join(root, 'a.md'), join(root, 'b.md'))
  }
})
add({
  id: 'case-only-rename',
  description: 'a note renamed to the same name in another case',
  setup: (root) => write(join(root, 'n.md')),
  act: (root) => {
    renameSync(join(root, 'n.md'), join(root, 'N.md'))
  }
})
add({
  id: 'move-folder',
  description: 'a folder holding notes moved to a new name',
  setup: (root) => {
    write(join(root, 'a', 'b', 'n1.md'))
    write(join(root, 'a', 'n2.md'))
  },
  act: (root) => {
    renameSync(join(root, 'a'), join(root, 'z'))
  }
})
add({
  id: 'copy-in-600-notes',
  description: 'a folder of 600 notes copied in from outside the notes root',
  maxIndexCalls: 1200,
  act: (root, outside) => {
    for (let i = 0; i < 600; i += 1) write(join(outside, 'bulk', `d${i % 20}`, `n${i}.md`))
    cpSync(join(outside, 'bulk'), join(root, 'bulk'), { recursive: true })
  }
})
add({
  id: 'delete-folder-with-notes',
  description: 'a folder holding notes and an image deleted',
  setup: (root) => {
    write(join(root, 'd', 'e', 'n.md'))
    write(join(root, 'd', 'p.bin'), 'x')
  },
  act: (root) => rmSync(join(root, 'd'), { recursive: true })
})
add({
  id: 'folder-replaced-by-file',
  description: 'a folder holding notes replaced by a file of the same name',
  setup: (root) => {
    write(join(root, 'f', 'n.md'))
    write(join(root, 'f', 'm.md'))
  },
  act: (root) => {
    rmSync(join(root, 'f'), { recursive: true })
    write(join(root, 'f'), 'not a folder')
  }
})
add({
  id: 'rename-folder-onto-existing-empty',
  description: 'a folder holding a note renamed onto an existing empty folder',
  setup: (root) => {
    write(join(root, 'g1', 'n.md'))
    mkdirSync(join(root, 'g2'))
  },
  act: (root) => {
    renameSync(join(root, 'g1'), join(root, 'g2'))
  }
})
add({
  id: 'folder-with-only-non-markdown',
  description: 'a folder that holds only a non-markdown file',
  act: (root) => write(join(root, 'docs', 'x.pdf'), 'x')
})
add({
  id: 'folder-and-note-at-once',
  description: 'a folder and a note inside it created in the same tick',
  act: (root) => {
    mkdirSync(join(root, 'n'))
    writeFileSync(join(root, 'n', 'a.md'), '# a\n')
  }
})
add({
  id: 'symlink-to-folder-of-notes',
  description: 'a symbolic link to a folder of notes created inside the notes root',
  informational: true,
  act: (root, outside) => {
    write(join(outside, 'linked', 'n.md'))
    symlinkSync(join(outside, 'linked'), join(root, 'link'))
  }
})
add({
  id: 'burst-200-edits',
  description:
    '200 edits of one note over about a second, each too soon after the last for the write to have settled',
  maxIndexCalls: 5,
  setup: (root) => write(join(root, 'burst.md')),
  act: async (root) => {
    for (let i = 0; i < 200; i += 1) {
      writeFileSync(join(root, 'burst.md'), `# edit ${i}\n`)
      await sleep(5)
    }
  }
})

/** No domain event for this long, twice in a row, counts as quiet. Longer than the debounce plus write stability. */
const QUIET_MS = 1600
const QUIET_CAP_MS = 10_000
const READY_MS = 1000

export interface RunOptions {
  make: () => WatcherLike
  /** Filled by the caller's indexer stub; cleared at the start of a run. */
  indexCalls: IndexCall[]
}

export async function runScenario(scenario: Scenario, options: RunOptions): Promise<Reduction> {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'ryte-watch-')))
  const root = join(base, 'notes')
  const outside = join(base, 'outside')
  mkdirSync(root)
  mkdirSync(outside)
  options.indexCalls.length = 0
  const treeEvents: number[] = []
  const catalogEvents: CatalogEventLike[] = []
  let lastEventAt = Date.now()
  const watcher = options.make()
  const offTree = watcher.onTreeChanged(() => {
    treeEvents.push(Date.now())
    lastEventAt = Date.now()
  })
  const offCatalog = watcher.onCatalogChanged((event) => {
    catalogEvents.push(event)
    lastEventAt = Date.now()
  })
  try {
    scenario.setup?.(root, outside)
    watcher.start(root)
    await sleep(READY_MS)
    // Anything the watcher reported about the setup or its start-up is not part of the scenario.
    treeEvents.length = 0
    catalogEvents.length = 0
    options.indexCalls.length = 0
    lastEventAt = Date.now()
    const indexCountAtAct = (): number => options.indexCalls.length
    const actStartedAt = Date.now()
    await scenario.act(root, outside)
    // Quiet is measured from the end of the script, so a slow script is not cut off by its own duration.
    lastEventAt = Date.now()
    let seen = indexCountAtAct()
    let cappedBeforeQuiet = false
    for (;;) {
      await sleep(50)
      if (indexCountAtAct() !== seen) {
        seen = indexCountAtAct()
        lastEventAt = Date.now()
      }
      if (Date.now() - lastEventAt >= QUIET_MS) break
      if (Date.now() - actStartedAt >= QUIET_CAP_MS + QUIET_MS) {
        cappedBeforeQuiet = true
        break
      }
    }
    const rel = (path: string): string => relative(root, path)
    const lastOps = <T extends string>(pairs: Array<[string, T]>): Array<[string, T]> => {
      const map = new Map<string, T>()
      for (const [path, op] of pairs) map.set(path, op)
      return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    }
    return {
      tree: treeEvents.length > 0,
      catalog: lastOps(
        catalogEvents.map((event): [string, 'upsert' | 'remove'] => [rel(event.path), event.type])
      ),
      index: lastOps(
        options.indexCalls.map((call): [string, 'changed' | 'removed'] => [rel(call.path), call.op])
      ),
      rootOnEveryEvent: catalogEvents.every((event) => event.notesRoot === root),
      cappedBeforeQuiet
    }
  } finally {
    offTree()
    offCatalog()
    await watcher.stop()
    rmSync(base, { recursive: true, force: true })
  }
}
