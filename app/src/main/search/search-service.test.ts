import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock both providers — SearchService instantiates them at query-time.
const mockSynthesize = vi.fn()
vi.mock('./anthropic-provider', () => ({
  AnthropicProvider: vi.fn().mockImplementation(() => ({ synthesize: mockSynthesize }))
}))
vi.mock('./openai-provider', () => ({
  OpenAIProvider: vi.fn().mockImplementation(() => ({ synthesize: mockSynthesize }))
}))

import {
  SearchService,
  type CitationResult,
  type SearchAppliedRetrievalMode,
  type SearchCallbacks,
  type SourceResult
} from './search-service'
import type { StoredChunkRow } from '../indexing/vector-store'
import { modelProvider, type ModelId } from '../settings/settings-store'
import type { ProviderId } from '../../shared/provider-registry'

// --- minimal dep stubs ---

type MockSearchCallbacks = {
  [K in keyof SearchCallbacks]: ReturnType<typeof vi.fn>
}

function makeEmbed(vec = Float32Array.from([1, 0, 0])): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue([vec])
}

function makeHybridSearch(rows: StoredChunkRow[] = []): ReturnType<typeof vi.fn> {
  return vi.fn().mockReturnValue(rows)
}

function makeKeywordSearch(rows: StoredChunkRow[] = []): ReturnType<typeof vi.fn> {
  return vi.fn().mockReturnValue(rows)
}

function makeRetrieve(rows: StoredChunkRow[] = []): {
  hybridSearch: ReturnType<typeof vi.fn>
  keywordSearch: ReturnType<typeof vi.fn>
  sourcePathsIndexedAfter: ReturnType<typeof vi.fn>
  existingSourcePaths: ReturnType<typeof vi.fn>
} {
  return {
    hybridSearch: makeHybridSearch(rows),
    keywordSearch: makeKeywordSearch(rows),
    sourcePathsIndexedAfter: vi.fn(() => []),
    existingSourcePaths: vi.fn((sourcePaths: string[]) => sourcePaths)
  }
}

function makeSettings(
  model: ModelId = 'claude-haiku-4-5',
  key: string | null = 'sk-test',
  opts: {
    cloudAnswersEnabled?: boolean
    cloudAnswersAcknowledgement?: {
      acknowledgedAt: string
      provider: ProviderId
      model: string
    } | null
  } = {}
): {
  load: ReturnType<typeof vi.fn>
  getSecret: ReturnType<typeof vi.fn>
} {
  return {
    load: vi.fn().mockReturnValue({
      cloudAnswersEnabled: opts.cloudAnswersEnabled ?? true,
      cloudAnswersAcknowledgement:
        opts.cloudAnswersAcknowledgement === undefined
          ? { acknowledgedAt: '2026-05-19T12:00:00.000Z', provider: modelProvider(model), model }
          : opts.cloudAnswersAcknowledgement,
      answerProvider: modelProvider(model),
      answerModel: model
    }),
    getSecret: vi.fn(() => key)
  }
}

function row(sourcePath: string, text: string, headingPath: string[] = []): StoredChunkRow {
  return { text, sourcePath, headingPath, date: null }
}

function source(
  sourcePath: string,
  preview: string,
  index = 1,
  retrievalMode: SearchAppliedRetrievalMode = 'hybrid',
  headingPath: string[] = [],
  matchCount = 0
): SourceResult {
  return { index, sourcePath, headingPath, preview, matchCount, retrievalMode }
}

function service(
  rows: StoredChunkRow[] = [],
  model: ModelId = 'claude-haiku-4-5',
  key: string | null = 'sk-test'
): SearchService {
  return new SearchService({ embed: makeEmbed() }, makeRetrieve(rows), makeSettings(model, key))
}

function makeCallbacks(): MockSearchCallbacks {
  return {
    onStage: vi.fn(),
    onToken: vi.fn(),
    onSources: vi.fn(),
    onCitation: vi.fn(),
    onNotice: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn()
  }
}

// Default synthesize: stream a two-citation answer.
function defaultSynthesize(): void {
  mockSynthesize.mockImplementation(
    async (_q: string, _chunks: unknown, onToken: (t: string) => void) => {
      onToken('Answer referencing [1] and [2].')
    }
  )
}

describe('SearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    defaultSynthesize()
  })

  it('calls onDone after a successful search', async () => {
    const svc = service([row('a.md', 'body')])
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    expect(cb.onDone).toHaveBeenCalledOnce()
    expect(cb.onError).not.toHaveBeenCalled()
    expect(cb.onStage).toHaveBeenNthCalledWith(1, 'searching-local')
    expect(cb.onStage).toHaveBeenNthCalledWith(2, 'gathering-evidence')
    expect(cb.onStage).toHaveBeenNthCalledWith(3, 'writing-summary')
  })

  it('sends newer notes to the provider first, labelled with their dates', async () => {
    const dated = (sourcePath: string, date: string): StoredChunkRow => ({
      ...row(sourcePath, 'body'),
      date
    })
    const svc = service([
      dated('sessions/2025-01-10/old-plan.md', '2025-01-10'),
      dated('sessions/2026-10-20/new-plan.md', '2026-10-20')
    ])
    await svc.search('q', 'req-recency', makeCallbacks())

    const chunks = mockSynthesize.mock.calls[0][1] as Array<{
      sourcePath: string
      date: string | null
    }>
    expect(chunks.map((chunk) => chunk.sourcePath)).toEqual([
      'sessions/2026-10-20/new-plan.md',
      'sessions/2025-01-10/old-plan.md'
    ])
    expect(chunks[0].date).toBe('2026-10-20')
  })

  it('streams tokens via onToken', async () => {
    mockSynthesize.mockImplementation(
      async (_q: unknown, _c: unknown, onToken: (t: string) => void) => {
        onToken('Hello ')
        onToken('world')
      }
    )
    const svc = service([row('a.md', 'body')])
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    expect(cb.onToken).toHaveBeenCalledTimes(2)
    expect(cb.onToken).toHaveBeenNthCalledWith(1, 'Hello ')
    expect(cb.onToken).toHaveBeenNthCalledWith(2, 'world')
  })

  it('emits onCitation for each [N] marker referencing a retrieved chunk', async () => {
    const svc = service([row('a.md', 'chunk A'), row('b.md', 'chunk B')])
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    const citations: CitationResult[] = cb.onCitation.mock.calls.map(
      (c: unknown[]) => c[0] as CitationResult
    )
    const paths = citations.map((c) => c.sourcePath)
    expect(paths).toContain('a.md')
    expect(paths).toContain('b.md')
  })

  it('does not emit duplicate citations for repeated [N] markers', async () => {
    mockSynthesize.mockImplementation(
      async (_q: unknown, _c: unknown, onToken: (t: string) => void) => {
        onToken('[1] repeated [1] again')
      }
    )
    const svc = service([row('a.md', 'body')])
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    const cited = cb.onCitation.mock.calls.filter(
      (c: unknown[]) => (c[0] as CitationResult).index === 1
    )
    expect(cited).toHaveLength(1)
  })

  it('emits a citation as soon as its marker completes, while the answer is still streaming', async () => {
    const seen: string[] = []
    const cb = makeCallbacks()
    cb.onCitation.mockImplementation((c: CitationResult) => seen.push(`cite:${c.index}`))
    mockSynthesize.mockImplementation(
      async (_q: unknown, _c: unknown, onToken: (t: string) => void) => {
        for (const token of ['First claim [', '1] and more ', 'text [2', '].']) {
          seen.push(`token:${token}`)
          onToken(token)
          await Promise.resolve()
        }
        seen.push('synthesis-finished')
      }
    )
    const svc = service([row('a.md', 'chunk A'), row('b.md', 'chunk B')])
    await svc.search('q', 'req-progressive', cb)

    expect(seen).toEqual([
      'token:First claim [',
      'token:1] and more ',
      'cite:1',
      'token:text [2',
      'token:].',
      'cite:2',
      'synthesis-finished'
    ])
  })

  it('does not pass a key fragment from a failed provider call on to the user', async () => {
    mockSynthesize.mockRejectedValue(
      new Error('401 Incorrect API key provided: sk-proj-****************wxyz.')
    )
    const svc = service([row('a.md', 'body')])
    const cb = makeCallbacks()
    await svc.search('q', 'req-secret', cb)

    expect(cb.onError).toHaveBeenCalledOnce()
    const message = cb.onError.mock.calls[0][0] as string
    expect(message).toContain('answer failed')
    expect(message).toContain('Incorrect API key provided')
    expect(message).not.toMatch(/sk-/)
  })

  it('returns local sources without synthesis when API key is missing', async () => {
    const svc = service([row('a.md', 'body')], 'claude-haiku-4-5', null)
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    expect(cb.onNotice).toHaveBeenCalledWith({
      code: 'provider-key-missing',
      message: 'Cloud answer skipped because no Anthropic API key is saved for claude-haiku-4-5.'
    })
    expect(cb.onError).not.toHaveBeenCalled()
    expect(mockSynthesize).not.toHaveBeenCalled()
    expect(cb.onDone).toHaveBeenCalledOnce()
  })

  it('centres long previews on matching text and reports match counts', async () => {
    const text = `${'before '.repeat(50)}release plan risks ${'after '.repeat(50)}release plan`
    const svc = service([row('release.md', text)])
    const cb = makeCallbacks()

    await svc.search('release plan', 'req-preview', cb, { answerMode: 'local-only' })

    expect(cb.onSources).toHaveBeenCalledWith([
      expect.objectContaining({
        matchCount: 4,
        preview: expect.stringContaining('release plan risks')
      })
    ])
  })

  it('reports when no local sources are found', async () => {
    const svc = service([])
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    expect(cb.onSources).toHaveBeenCalledWith([])
    expect(cb.onNotice).toHaveBeenCalledWith({
      code: 'no-local-sources',
      message: 'No local sources found. Try a different query or rebuild the local index.'
    })
    expect(mockSynthesize).not.toHaveBeenCalled()
    expect(cb.onDone).toHaveBeenCalledOnce()
  })

  it('does not flag unrelated newly indexed files as summary updates', async () => {
    const retrieve = makeRetrieve([row('older.md', 'older result')])
    retrieve.sourcePathsIndexedAfter.mockReturnValue(['unrelated.md'])
    const svc = new SearchService({ embed: makeEmbed() }, retrieve, makeSettings())

    await expect(
      svc.checkSnapshotFreshness({
        query: 'jira plans',
        retrievalMode: 'keyword',
        generatedAt: 100,
        sourcePaths: ['older.md']
      })
    ).resolves.toEqual({
      state: 'current',
      changedSourcePaths: ['unrelated.md'],
      relevantSourcePaths: []
    })
  })

  it('flags relevant newer evidence and changed saved sources for an optional summary update', async () => {
    const retrieve = makeRetrieve([row('new-jira.md', 'new relevant result')])
    retrieve.sourcePathsIndexedAfter.mockReturnValue(['saved.md', 'new-jira.md'])
    const svc = new SearchService({ embed: makeEmbed() }, retrieve, makeSettings())

    await expect(
      svc.checkSnapshotFreshness({
        query: 'jira plans',
        retrievalMode: 'keyword',
        generatedAt: 100,
        sourcePaths: ['saved.md']
      })
    ).resolves.toEqual({
      state: 'updates-available',
      changedSourcePaths: ['saved.md', 'new-jira.md'],
      relevantSourcePaths: ['saved.md', 'new-jira.md']
    })
  })

  it('flags a missing saved source even when no newer files were indexed', async () => {
    const retrieve = makeRetrieve()
    retrieve.existingSourcePaths.mockReturnValue([])
    const svc = new SearchService({ embed: makeEmbed() }, retrieve, makeSettings())

    await expect(
      svc.checkSnapshotFreshness({
        query: 'jira plans',
        retrievalMode: 'keyword',
        generatedAt: 100,
        sourcePaths: ['removed.md']
      })
    ).resolves.toEqual({
      state: 'updates-available',
      changedSourcePaths: [],
      relevantSourcePaths: ['removed.md']
    })
  })

  it('does not synthesize when cloud answers are disabled', async () => {
    const svc = new SearchService(
      { embed: makeEmbed() },
      makeRetrieve([row('local.md', 'local result')]),
      makeSettings('gpt-5.2', 'sk-openai', { cloudAnswersEnabled: false })
    )
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    expect(cb.onSources).toHaveBeenCalledWith([source('local.md', 'local result')])
    expect(cb.onNotice).toHaveBeenCalledWith({
      code: 'cloud-answers-disabled',
      message: 'Cloud answer skipped because Cloud Answers are disabled in Preferences.'
    })
    expect(mockSynthesize).not.toHaveBeenCalled()
    expect(cb.onDone).toHaveBeenCalledOnce()
  })

  it('does not synthesize before first cloud-use acknowledgement', async () => {
    const svc = new SearchService(
      { embed: makeEmbed() },
      makeRetrieve([row('local.md', 'local result')]),
      makeSettings('gpt-5.2', 'sk-openai', { cloudAnswersAcknowledgement: null })
    )
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    expect(cb.onNotice).toHaveBeenCalledWith({
      code: 'cloud-answers-not-acknowledged',
      message: 'Cloud answer skipped until the first-use warning is accepted.'
    })
    expect(mockSynthesize).not.toHaveBeenCalled()
    expect(cb.onDone).toHaveBeenCalledOnce()
  })

  it.each([
    ['provider', { provider: 'anthropic' as const, model: 'gpt-5.2' }],
    ['model', { provider: 'openai' as const, model: 'gpt-5.1' }]
  ])(
    'does not synthesize when the acknowledgement was given for another %s',
    async (_changed, acknowledged) => {
      const svc = new SearchService(
        { embed: makeEmbed() },
        makeRetrieve([row('local.md', 'local result')]),
        makeSettings('gpt-5.2', 'sk-openai', {
          cloudAnswersAcknowledgement: {
            acknowledgedAt: '2026-05-19T12:00:00.000Z',
            ...acknowledged
          }
        })
      )
      const cb = makeCallbacks()
      await svc.search('q', 'req-1', cb)
      expect(cb.onNotice).toHaveBeenCalledWith({
        code: 'cloud-answers-not-acknowledged',
        message: 'Cloud answer skipped until the warning is accepted for this provider and model.'
      })
      expect(mockSynthesize).not.toHaveBeenCalled()
      expect(cb.onDone).toHaveBeenCalledOnce()
    }
  )

  it('falls back to keyword search when embeddings are unavailable', async () => {
    const embed = vi.fn().mockRejectedValue(new Error('No embedding provider configured'))
    const retrieve = makeRetrieve([row('local.md', 'keyword result')])
    const svc = new SearchService({ embed }, retrieve, makeSettings('claude-haiku-4-5', null))
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    expect(retrieve.keywordSearch).toHaveBeenCalledWith('q', 40)
    expect(cb.onSources).toHaveBeenCalledWith([source('local.md', 'keyword result', 1, 'keyword')])
    expect(cb.onDone).toHaveBeenCalledOnce()
    expect(cb.onError).not.toHaveBeenCalled()
  })

  it('can force keyword retrieval without embedding or cloud settings reads', async () => {
    const embed = makeEmbed()
    const retrieve = makeRetrieve([row('keyword.md', 'keyword body')])
    const settings = makeSettings('gpt-5.2', 'sk-openai')
    const svc = new SearchService({ embed }, retrieve, settings)
    const cb = makeCallbacks()

    await svc.search('q', 'req-1', cb, { retrievalMode: 'keyword', answerMode: 'local-only' })

    expect(embed).not.toHaveBeenCalled()
    expect(retrieve.hybridSearch).not.toHaveBeenCalled()
    expect(retrieve.keywordSearch).toHaveBeenCalledWith('q', 40)
    expect(cb.onSources).toHaveBeenCalledWith([source('keyword.md', 'keyword body', 1, 'keyword')])
    expect(settings.load).not.toHaveBeenCalled()
    expect(settings.getSecret).not.toHaveBeenCalled()
    expect(mockSynthesize).not.toHaveBeenCalled()
    expect(cb.onNotice).not.toHaveBeenCalled()
    expect(cb.onDone).toHaveBeenCalledOnce()
  })

  it('reports semantic fallback when hybrid retrieval is explicitly requested', async () => {
    const embed = vi.fn().mockRejectedValue(new Error('No embedding provider configured'))
    const retrieve = makeRetrieve([row('local.md', 'keyword result')])
    const svc = new SearchService({ embed }, retrieve, makeSettings('claude-haiku-4-5', null))
    const cb = makeCallbacks()

    await svc.search('q', 'req-1', cb, { retrievalMode: 'hybrid', answerMode: 'local-only' })

    expect(cb.onNotice).toHaveBeenCalledWith({
      code: 'semantic-unavailable',
      message: 'Semantic retrieval unavailable; showing keyword results.'
    })
    expect(cb.onSources).toHaveBeenCalledWith([source('local.md', 'keyword result', 1, 'keyword')])
    expect(cb.onDone).toHaveBeenCalledOnce()
  })

  it('adds provider and model context to synthesis errors', async () => {
    mockSynthesize.mockRejectedValue(new Error('bad request'))
    const svc = service([row('a.md', 'body')], 'gpt-5.2', 'sk-openai')
    const cb = makeCallbacks()
    await svc.search('q', 'req-1', cb)
    expect(cb.onSources).toHaveBeenCalledWith([source('a.md', 'body')])
    expect(cb.onError).toHaveBeenCalledWith('OpenAI gpt-5.2 answer failed: bad request')
    expect(cb.onDone).not.toHaveBeenCalled()
  })

  it('uses AnthropicProvider for claude models', async () => {
    const { AnthropicProvider } = await import('./anthropic-provider')
    const svc = service([row('a.md', 'body')], 'claude-haiku-4-5', 'sk-anthropic')
    await svc.search('q', 'req-1', makeCallbacks())
    expect(AnthropicProvider).toHaveBeenCalledWith('sk-anthropic', 'claude-haiku-4-5')
  })

  it('uses OpenAIProvider for gpt models', async () => {
    const { OpenAIProvider } = await import('./openai-provider')
    const svc = service([row('a.md', 'body')], 'gpt-4o-mini', 'sk-openai')
    await svc.search('q', 'req-1', makeCallbacks())
    expect(OpenAIProvider).toHaveBeenCalledWith('sk-openai', 'gpt-4o-mini')
  })

  it('passes an abort signal to provider synthesis', async () => {
    const svc = service([row('a.md', 'body')], 'gpt-5.2', 'sk-openai')
    await svc.search('q', 'req-1', makeCallbacks())
    const options = mockSynthesize.mock.calls[0][3] as { signal?: AbortSignal }
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it('cancel() aborts an active provider stream', async () => {
    let signal: AbortSignal | undefined
    mockSynthesize.mockImplementation(
      async (_q: unknown, _c: unknown, _onToken: unknown, options: { signal?: AbortSignal }) => {
        signal = options.signal
        await new Promise<void>((resolve) => {
          options.signal?.addEventListener('abort', () => resolve(), { once: true })
        })
      }
    )
    const svc = service([row('a.md', 'body')], 'gpt-5.2', 'sk-openai')
    const cb = makeCallbacks()
    const searchPromise = svc.search('q', 'req-stream-cancel', cb)
    await vi.waitFor(() => expect(signal).toBeDefined())
    svc.cancel('req-stream-cancel')
    await searchPromise
    expect(signal?.aborted).toBe(true)
    expect(cb.onDone).not.toHaveBeenCalled()
  })

  it('cancel() prevents onToken/onDone from being called for that requestId', async () => {
    // Block at the embed step so we can cancel before the pipeline progresses.
    let resolveEmbed!: (vecs: Float32Array[]) => void
    const blockingEmbed = vi.fn().mockReturnValue(
      new Promise<Float32Array[]>((r) => {
        resolveEmbed = r
      })
    )
    const svc = new SearchService(
      { embed: blockingEmbed },
      makeRetrieve([row('a.md', 'body')]),
      makeSettings()
    )
    const cb = makeCallbacks()
    const searchPromise = svc.search('q', 'req-cancel', cb)
    svc.cancel('req-cancel')
    resolveEmbed([Float32Array.from([1, 0, 0])]) // unblock embed; pipeline checks cancel and exits
    await searchPromise
    expect(cb.onToken).not.toHaveBeenCalled()
    expect(cb.onDone).not.toHaveBeenCalled()
  })
})
