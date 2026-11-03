import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Excluded from `pnpm test` (vitest.config.ts); run by `pnpm test:native`, which uses Electron's Node. The real indexer service on
// real SQLite stores, with only the settings and the app's data folder stood in for, so what a folder change does to a pass that
// is running is what the app does.

const h = vi.hoisted(() => ({ userData: '', notesRoot: '' }))

vi.mock('../settings/settings-store', () => ({
  settingsStore: {
    load: () => ({
      schemaVersion: 4,
      notesRoot: h.notesRoot,
      semanticIndexEnabled: false,
      semanticIndexAcknowledgement: null,
      embeddingProvider: 'openai',
      embeddingModel: 'text-embedding-3-small'
    }),
    getSecret: () => null
  }
}))
vi.mock('../paths', () => ({ userDataDir: () => h.userData }))

import { IndexerService } from './indexer-service'
import type { IndexerProgress } from './indexer'

const settle = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function until(condition: () => boolean, what: string, ms = 20_000): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`)
    await settle(10)
  }
}

describe('IndexerService when the folder changes under a running pass', () => {
  let work: string
  let services: IndexerService[]
  let notesA: string
  let notesB: string
  let notesC: string

  function makeNotes(dir: string, count: number, tag: string): void {
    mkdirSync(dir, { recursive: true })
    for (let i = 0; i < count; i += 1) {
      writeFileSync(join(dir, `note-${i}.md`), `# Note ${i}\n\nbody ${tag} unique${i}\n`)
    }
  }

  function start(): { svc: IndexerService; events: IndexerProgress[] } {
    const svc = new IndexerService()
    services.push(svc)
    const events: IndexerProgress[] = []
    svc.subscribe((status) => events.push({ ...status }))
    return { svc, events }
  }

  /** What the restarter does after the folder setting changed: close, point at the new folder, open, ask for a pass. */
  async function switchTo(svc: IndexerService, notesRoot: string): Promise<void> {
    svc.close()
    h.notesRoot = notesRoot
    expect(svc.init()).toBe(true)
    await svc.triggerReindex()
  }

  const rows = (svc: IndexerService, sql: string): number =>
    (svc.getVectorStore()!.database.prepare(sql).get() as { n: number }).n

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'ryte-stale-pass-'))
    h.userData = join(work, 'user-data')
    mkdirSync(h.userData)
    notesA = join(work, 'notes-a')
    notesB = join(work, 'notes-b')
    notesC = join(work, 'notes-c')
    services = []
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    for (const svc of services) svc.close()
    vi.restoreAllMocks()
    rmSync(work, { recursive: true, force: true })
  })

  it('stops the old pass quietly: no error, nothing of the old folder, and the new folder is indexed', async () => {
    makeNotes(notesA, 1500, 'OLD')
    makeNotes(notesB, 20, 'NEW')
    h.notesRoot = notesA
    const { svc, events } = start()
    svc.init()
    const pass = svc.triggerReindex()
    await until(
      () => events.some((e) => e.phase === 'indexing' && e.filesDone >= 100),
      'the old pass to be well under way'
    )
    const switchedAt = events.length

    await switchTo(svc, notesB)
    await pass
    await until(
      () => svc.getStatus().phase === 'done' && svc.getStatus().filesTotal === 20,
      'the new folder to be indexed'
    )

    const after = events.slice(switchedAt)
    expect(after.map((e) => e.phase)).not.toContain('error')
    // Nothing from the old pass's counts reaches the status once the folder has changed.
    expect(after.filter((e) => e.filesTotal === 1500)).toEqual([])
    expect(svc.getStatus().error).toBeUndefined()
    expect(rows(svc, 'SELECT COUNT(*) AS n FROM file_state')).toBe(20)
    expect(rows(svc, "SELECT COUNT(*) AS n FROM chunks WHERE text LIKE '%OLD%'")).toBe(0)
  })

  it('runs exactly one more pass after two changes in a row, for the last folder', async () => {
    makeNotes(notesA, 1500, 'A')
    makeNotes(notesB, 1500, 'B')
    makeNotes(notesC, 15, 'C')
    h.notesRoot = notesA
    const { svc, events } = start()
    svc.init()
    void svc.triggerReindex()
    await until(() => events.some((e) => e.phase === 'indexing' && e.filesDone >= 50), 'pass A')
    const switchedAt = events.length

    await switchTo(svc, notesB)
    await until(
      () => events.slice(switchedAt).some((e) => e.phase === 'indexing' && e.filesTotal === 1500),
      'pass B to begin'
    )
    await switchTo(svc, notesC)
    await until(
      () => svc.getStatus().phase === 'done' && svc.getStatus().filesTotal === 15,
      'folder C to be indexed'
    )
    await settle(300)

    expect(events.slice(switchedAt).map((e) => e.phase)).not.toContain('error')
    expect(rows(svc, 'SELECT COUNT(*) AS n FROM file_state')).toBe(15)
    expect(rows(svc, "SELECT COUNT(*) AS n FROM chunks WHERE text LIKE '%unique%'")).toBe(15)
    // One pass for C: its walking phase appears once after the last change.
    const afterLastChange = events.slice(switchedAt)
    const cWalks = afterLastChange.filter(
      (e, i) => e.phase === 'walking' && afterLastChange[i - 1]?.phase !== 'walking'
    )
    expect(cWalks.length).toBeLessThanOrEqual(2)
  })

  it('finishes the job when the indexer is restarted for the same folder in the middle of a pass', async () => {
    makeNotes(notesA, 1500, 'SAME')
    h.notesRoot = notesA
    const { svc, events } = start()
    svc.init()
    void svc.triggerReindex()
    await until(
      () => events.some((e) => e.phase === 'indexing' && e.filesDone >= 100),
      'the pass to be well under way'
    )
    const restartedAt = events.length

    // A restart with no reindex asked for, as for a setting that does not name the folder.
    svc.close()
    expect(svc.init()).toBe(true)
    await until(
      () =>
        rows(svc, 'SELECT COUNT(*) AS n FROM file_state') === 1500 &&
        svc.getStatus().phase === 'done',
      'the new indexer to complete the index'
    )

    expect(events.slice(restartedAt).map((e) => e.phase)).not.toContain('error')
  })

  it('leaves no error and starts nothing when the app quits in the middle of a pass', async () => {
    makeNotes(notesA, 1500, 'QUIT')
    h.notesRoot = notesA
    const { svc, events } = start()
    svc.init()
    const pass = svc.triggerReindex()
    await until(
      () => events.some((e) => e.phase === 'indexing' && e.filesDone >= 100),
      'the pass to be well under way'
    )
    const quitAt = events.length

    svc.close()
    await pass
    await settle(300)

    expect(events.slice(quitAt).map((e) => e.phase)).not.toContain('error')
    // Nothing was opened again.
    expect(svc.getVectorStore()).toBeNull()
  })

  it('lets a rebuild that is cut by a folder change end quietly, and indexes the new folder', async () => {
    makeNotes(notesA, 1500, 'OLD')
    makeNotes(notesB, 20, 'NEW')
    h.notesRoot = notesA
    const { svc, events } = start()
    svc.init()
    await svc.triggerReindex()
    const rebuild = svc.clearAndRebuild()
    await until(
      () =>
        events.filter((e) => e.phase === 'indexing').length > 0 &&
        events.at(-1)?.phase === 'indexing',
      'the rebuild pass to begin'
    )
    const switchedAt = events.length

    await switchTo(svc, notesB)
    await expect(rebuild).resolves.toBeUndefined()
    await until(
      () => svc.getStatus().phase === 'done' && svc.getStatus().filesTotal === 20,
      'the new folder to be indexed'
    )

    expect(events.slice(switchedAt).map((e) => e.phase)).not.toContain('error')
    expect(rows(svc, 'SELECT COUNT(*) AS n FROM file_state')).toBe(20)
  })
})
