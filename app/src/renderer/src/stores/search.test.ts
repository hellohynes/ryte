import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSearchStore } from './search'
import type { HistoryEntry } from './search-history'
import type { SearchSnapshotFreshness } from '../../../main/search/search-service'

function snapshot(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 'snapshot-1',
    query: 'jira plans',
    answer: 'A saved answer [1].',
    sources: [
      {
        index: 1,
        sourcePath: 'plans/jira.md',
        headingPath: ['Plan'],
        preview: '',
        matchCount: 2,
        retrievalMode: 'keyword'
      },
      {
        index: 2,
        sourcePath: 'plans/jira.md',
        headingPath: ['Risks'],
        preview: '',
        matchCount: 1,
        retrievalMode: 'keyword'
      }
    ],
    citations: [{ index: 1, sourcePath: 'plans/jira.md', headingPath: ['Plan'] }],
    timestamp: 1_000,
    answerModel: 'gpt-6-luna',
    retrievalMode: 'keyword',
    ...overrides
  }
}

type Listener = (requestId: string, ...args: never[]) => void

/** A synthetic preload API whose event channels the tests drive by hand. */
function installRyteApi(freshness: () => Promise<SearchSnapshotFreshness>): {
  emit: (channel: string, ...args: unknown[]) => void
  query: ReturnType<typeof vi.fn>
  checkSnapshotFreshness: ReturnType<typeof vi.fn>
} {
  const listeners = new Map<string, Listener>()
  const on = (channel: string) => (cb: Listener) => {
    listeners.set(channel, cb)
    return () => listeners.delete(channel)
  }
  const query = vi.fn(async () => 'request-1')
  const checkSnapshotFreshness = vi.fn(freshness)
  vi.stubGlobal('window', {
    ryte: {
      search: {
        query,
        cancel: vi.fn(async () => undefined),
        checkSnapshotFreshness,
        onStage: on('stage'),
        onSources: on('sources'),
        onToken: on('token'),
        onCitation: on('citation'),
        onNotice: on('notice'),
        onDone: on('done'),
        onError: on('error')
      }
    }
  })
  return {
    emit: (channel, ...args) => (listeners.get(channel) as (...a: unknown[]) => void)(...args),
    query,
    checkSnapshotFreshness
  }
}

const current: SearchSnapshotFreshness = {
  state: 'current',
  changedSourcePaths: [],
  relevantSourcePaths: []
}

describe('search snapshot restore', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.unstubAllGlobals())

  it('restores a saved answer without starting a new request', () => {
    const api = installRyteApi(async () => current)
    const search = useSearchStore()

    expect(search.restoreSnapshot(snapshot())).toBe(true)
    expect(search.query).toBe('jira plans')
    expect(search.answer).toBe('A saved answer [1].')
    expect(search.sources).toHaveLength(2)
    expect(search.citations).toHaveLength(1)
    expect(search.status).toBe('done')
    expect(search.activeRequestId).toBeNull()
    expect(search.restoredSnapshotId).toBe('snapshot-1')
    expect(search.generatedAt).toBe(1_000)
    expect(api.query).not.toHaveBeenCalled()
  })

  it('does not restore query-only history as an answer snapshot', () => {
    installRyteApi(async () => current)
    const search = useSearchStore()
    const entry = snapshot({ answer: '', sources: [], citations: [] })

    expect(search.restoreSnapshot(entry)).toBe(false)
    expect(search.status).toBe('idle')
  })
})

describe('snapshot freshness', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.unstubAllGlobals())

  it('checks the exact saved query, mode, time and unique source paths', async () => {
    const api = installRyteApi(async () => current)
    const search = useSearchStore()

    search.restoreSnapshot(snapshot())
    expect(search.freshness.state).toBe('checking')
    await vi.waitFor(() => expect(search.freshness.state).toBe('current'))

    expect(api.checkSnapshotFreshness).toHaveBeenCalledTimes(1)
    expect(api.checkSnapshotFreshness).toHaveBeenCalledWith({
      query: 'jira plans',
      retrievalMode: 'keyword',
      generatedAt: 1_000,
      sourcePaths: ['plans/jira.md']
    })
  })

  it('offers an update only when relevant newer material exists, and lets the user keep current', async () => {
    installRyteApi(async () => ({
      state: 'updates-available',
      changedSourcePaths: ['a.md', 'b.md'],
      relevantSourcePaths: ['a.md', 'b.md']
    }))
    const search = useSearchStore()

    search.restoreSnapshot(snapshot())
    await vi.waitFor(() => expect(search.freshness.state).toBe('updates-available'))
    expect(search.freshness.relevantCount).toBe(2)

    search.keepCurrent()
    expect(search.freshness.state).toBe('kept')
    expect(search.answer).toBe('A saved answer [1].')
  })

  it('ignores a freshness result that arrives after another snapshot was restored', async () => {
    let resolveFirst!: (value: SearchSnapshotFreshness) => void
    const results = [
      new Promise<SearchSnapshotFreshness>((resolve) => (resolveFirst = resolve)),
      Promise.resolve(current)
    ]
    installRyteApi(() => results.shift() as Promise<SearchSnapshotFreshness>)
    const search = useSearchStore()

    search.restoreSnapshot(snapshot({ id: 'first' }))
    search.restoreSnapshot(snapshot({ id: 'second', query: 'other' }))
    await vi.waitFor(() => expect(search.freshness.state).toBe('current'))
    resolveFirst({
      state: 'updates-available',
      changedSourcePaths: ['x.md'],
      relevantSourcePaths: ['x.md']
    })
    await Promise.resolve()

    expect(search.freshness.state).toBe('current')
  })

  it('shows no warning when the check itself fails', async () => {
    installRyteApi(async () => {
      throw new Error('index unavailable')
    })
    const search = useSearchStore()

    search.restoreSnapshot(snapshot())
    await vi.waitFor(() => expect(search.freshness.state).toBe('unavailable'))
    expect(search.answer).toBe('A saved answer [1].')
  })
})

describe('completed runs', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.unstubAllGlobals())

  async function completeRun(
    search: ReturnType<typeof useSearchStore>,
    api: ReturnType<typeof installRyteApi>,
    answer: string
  ): Promise<void> {
    await search.runQuery('Jira plans', { retrievalMode: 'auto' }, { answerModel: 'gpt-6-luna' })
    api.emit('stage', 'request-1', 'searching-local')
    api.emit('sources', 'request-1', snapshot().sources)
    api.emit('stage', 'request-1', 'gathering-evidence')
    api.emit('stage', 'request-1', 'writing-summary')
    if (answer) {
      api.emit('token', 'request-1', answer)
      api.emit('citation', 'request-1', snapshot().citations[0])
    }
    api.emit('done', 'request-1')
  }

  function bound(): {
    search: ReturnType<typeof useSearchStore>
    api: ReturnType<typeof installRyteApi>
  } {
    const api = installRyteApi(async () => current)
    const search = useSearchStore()
    search.configureHistory({ retention: 'forever', includeAnswers: true })
    search.bind()
    return { search, api }
  }

  it('replaces the saved snapshot for the same query only once the new run completes', async () => {
    const { search, api } = bound()
    search.history = [snapshot({ id: 'old', answer: 'Old answer [1].' })]

    await search.runQuery('jira  PLANS', {}, {})
    api.emit('stage', 'request-1', 'searching-local')
    api.emit('token', 'request-1', 'New answer [1].')
    expect(search.history.map((entry) => entry.answer)).toEqual(['Old answer [1].'])

    api.emit('citation', 'request-1', snapshot().citations[0])
    api.emit('sources', 'request-1', snapshot().sources)
    api.emit('done', 'request-1')

    expect(search.history).toHaveLength(1)
    expect(search.history[0].answer).toBe('New answer [1].')
    expect(search.history[0].id).not.toBe('old')
  })

  it('keeps the old snapshot when the update fails', async () => {
    const { search, api } = bound()
    search.history = [snapshot({ id: 'old' })]

    await search.runQuery('jira plans', {}, {})
    api.emit('error', 'request-1', 'provider failed')

    expect(search.history.map((entry) => entry.id)).toEqual(['old'])
    expect(search.status).toBe('error')
  })

  describe('updating a summary', () => {
    it('keeps the summary being replaced until the new run completes', async () => {
      const { search, api } = bound()
      search.restoreSnapshot(snapshot())

      await search.runQuery('Jira  plans', {}, { keepPrevious: true })
      expect(search.answer).toBe('')
      expect(search.previousSummary?.answer).toBe('A saved answer [1].')
      expect(search.previousSummary?.citations).toHaveLength(1)

      api.emit('token', 'request-1', 'New answer [1].')
      api.emit('done', 'request-1')
      expect(search.previousSummary).toBeNull()
    })

    it('keeps it when the update fails, so the reader is not left with nothing', async () => {
      const { search, api } = bound()
      search.restoreSnapshot(snapshot())

      await search.runQuery('jira plans', {}, { keepPrevious: true })
      api.emit('error', 'request-1', 'provider failed')

      expect(search.status).toBe('error')
      expect(search.previousSummary?.answer).toBe('A saved answer [1].')
    })

    it('keeps nothing for an ordinary search, or when the query is different', async () => {
      const { search } = bound()
      search.restoreSnapshot(snapshot())

      await search.runQuery('jira plans', {}, {})
      expect(search.previousSummary).toBeNull()

      search.restoreSnapshot(snapshot())
      await search.runQuery('something else', {}, { keepPrevious: true })
      expect(search.previousSummary).toBeNull()
    })
  })

  it('records stage timing, generation time and moves a repeated query to the top', async () => {
    const { search, api } = bound()
    search.history = [snapshot({ id: 'a', query: 'other' }), snapshot({ id: 'b' })]

    await completeRun(search, api, 'Answer [1].')

    expect(search.history.map((entry) => entry.query)).toEqual(['Jira plans', 'other'])
    expect(search.generatedAt).toBe(search.history[0].timestamp)
    expect(Object.keys(search.trace.stageAt)).toEqual([
      'searching-local',
      'gathering-evidence',
      'writing-summary'
    ])
    expect(search.trace.completedAt).not.toBeNull()
  })
})
