import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProviderId, ProviderKeyValidationResult } from '../../contract/settings'
import type { SettingsFile } from '../settings/settings-store'
import { createSettingsHandlers, settingsPatchRequiresIndexerRestart } from './settings-handlers'

const ctx = { sender: {} as never }
const SECRET = 'synthetic-secret-key-value'

const baseSettings = {
  notesRoot: '/notes',
  semanticIndexEnabled: false,
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small'
} as unknown as SettingsFile

const state = { notesRoot: '/notes', hasOpenAIKey: true } as never

interface Setup {
  calls: string[]
  handlers: ReturnType<typeof createSettingsHandlers>
  settings: Record<string, unknown>
  secrets: Partial<Record<ProviderId, string | null>>
  store: {
    update: ReturnType<typeof vi.fn>
    publicState: ReturnType<typeof vi.fn>
    markKeyValidated: ReturnType<typeof vi.fn>
    recordDiscoveredOpenAIModels: ReturnType<typeof vi.fn>
    getSecret: ReturnType<typeof vi.fn>
  }
  applyColorMode: ReturnType<typeof vi.fn>
  restartIndexing: ReturnType<typeof vi.fn>
  validateProviderKey: ReturnType<typeof vi.fn>
  listAuthorizedOpenAIModels: ReturnType<typeof vi.fn>
}

function setup(): Setup {
  const calls: string[] = []
  const settings: Record<string, unknown> = { ...baseSettings }
  const secrets: Partial<Record<ProviderId, string | null>> = { openai: SECRET }
  const next = { notesRoot: 'updated', hasOpenAIKey: true }
  const store = {
    load: vi.fn(() => {
      calls.push('store.load')
      return { ...settings } as unknown as SettingsFile
    }),
    update: vi.fn((patch: Record<string, unknown>) => {
      calls.push('store.update')
      for (const key of [
        'notesRoot',
        'semanticIndexEnabled',
        'embeddingProvider',
        'embeddingModel'
      ]) {
        if (patch[key] !== undefined) settings[key] = patch[key]
      }
      return next as never
    }),
    publicState: vi.fn(() => state),
    getSecret: vi.fn((provider: ProviderId) => secrets[provider] ?? null),
    markKeyValidated: vi.fn(() => {
      calls.push('store.markKeyValidated')
      return state
    }),
    recordDiscoveredOpenAIModels: vi.fn(() => {
      calls.push('store.recordDiscoveredOpenAIModels')
      return state
    })
  }
  const applyColorMode = vi.fn((mode: string) => {
    calls.push(`applyColorMode:${mode}`)
  })
  const restartIndexing = vi.fn<(options: { reindex: boolean }) => Promise<void>>(async () => {
    calls.push('restartIndexing')
  })
  const validateProviderKey = vi.fn<
    (provider: ProviderId, apiKey: string) => Promise<ProviderKeyValidationResult>
  >(async (provider) => ({
    ok: true,
    provider,
    validatedAt: '2026-11-02T00:00:00.000Z'
  }))
  const listAuthorizedOpenAIModels = vi.fn<(apiKey: string) => Promise<string[]>>(async () => [
    'gpt-5.2',
    'gpt-5.1'
  ])
  const handlers = createSettingsHandlers({
    store: store as never,
    applyColorMode,
    restartIndexing,
    validateProviderKey,
    listAuthorizedOpenAIModels
  })
  return {
    calls,
    handlers,
    settings,
    secrets,
    store,
    applyColorMode,
    restartIndexing,
    validateProviderKey,
    listAuthorizedOpenAIModels
  }
}

describe('getState', () => {
  it("returns the store's public state", async () => {
    const { handlers, store } = setup()

    await expect(handlers.getState(undefined, ctx)).resolves.toBe(state)
    expect(store.publicState).toHaveBeenCalledTimes(1)
  })
})

describe('save', () => {
  it('loads the previous settings, updates, applies the color mode, then restarts, in that order', async () => {
    const { handlers, calls } = setup()

    await handlers.save({ notesRoot: '/synthetic/new-root', colorMode: 'dark' }, ctx)

    expect(calls).toEqual([
      'store.load',
      'store.update',
      'applyColorMode:dark',
      'store.load',
      'restartIndexing'
    ])
  })

  it("returns the store's updated state", async () => {
    const { handlers, store } = setup()

    const result = await handlers.save({ colorMode: 'light' }, ctx)

    expect(result).toBe(store.update.mock.results[0]?.value)
  })

  it('applies the color mode only when the patch has one', async () => {
    const { handlers, applyColorMode } = setup()

    await handlers.save({ scrollbarVisibility: 'always' }, ctx)
    expect(applyColorMode).not.toHaveBeenCalled()

    await handlers.save({ colorMode: 'system' }, ctx)
    expect(applyColorMode).toHaveBeenCalledWith('system')
  })

  it('does not restart the indexer for a change that needs none', async () => {
    const { handlers, restartIndexing } = setup()

    await handlers.save({ colorMode: 'dark', fontFamily: 'geist' }, ctx)
    await handlers.save({ notesRoot: '/notes' }, ctx)
    await handlers.save({}, ctx)

    expect(restartIndexing).not.toHaveBeenCalled()
  })

  it('restarts the indexer once for a change that needs it', async () => {
    const { handlers, restartIndexing } = setup()

    await handlers.save({ semanticIndexEnabled: true }, ctx)

    expect(restartIndexing).toHaveBeenCalledTimes(1)
  })

  describe('asking the restart to reindex', () => {
    it('asks for a reindex when the notes folder changed', async () => {
      const { handlers, restartIndexing } = setup()

      await handlers.save({ notesRoot: '/synthetic/new-root' }, ctx)

      expect(restartIndexing).toHaveBeenCalledTimes(1)
      expect(restartIndexing).toHaveBeenCalledWith({ reindex: true })
    })

    it('does not ask for one when the restart is for another reason', async () => {
      const { handlers, restartIndexing } = setup()

      await handlers.save({ semanticIndexEnabled: true }, ctx)
      await handlers.save({ deleteProviderKeys: ['openai'] }, ctx)
      await handlers.save({ openaiKey: SECRET }, ctx)

      expect(restartIndexing.mock.calls.map(([options]) => options)).toEqual([
        { reindex: false },
        { reindex: false },
        { reindex: false }
      ])
    })

    it('does not restart or ask for anything when the folder is saved again unchanged', async () => {
      const { handlers, restartIndexing, settings } = setup()

      await handlers.save({ notesRoot: String(settings.notesRoot) }, ctx)

      expect(restartIndexing).not.toHaveBeenCalled()
    })

    it('asks for a reindex when the folder and an embedding setting change together, once', async () => {
      const { handlers, restartIndexing } = setup()

      await handlers.save({ notesRoot: '/synthetic/new-root', semanticIndexEnabled: true }, ctx)

      expect(restartIndexing).toHaveBeenCalledTimes(1)
      expect(restartIndexing).toHaveBeenCalledWith({ reindex: true })
    })

    it('compares the folder as written, so the same folder spelled another way restarts and reindexes once', async () => {
      const { handlers, restartIndexing, settings } = setup()

      await handlers.save({ notesRoot: `${String(settings.notesRoot)}/` }, ctx)

      expect(restartIndexing).toHaveBeenCalledTimes(1)
      expect(restartIndexing).toHaveBeenCalledWith({ reindex: true })
    })

    it('does not wait for the index pass, which the restart starts in the background', async () => {
      const { handlers, restartIndexing } = setup()
      let released = false
      restartIndexing.mockImplementation(async () => {
        // The restart itself finishes; the pass it started is not awaited by anyone.
        released = true
      })

      await handlers.save({ notesRoot: '/synthetic/new-root' }, ctx)

      expect(released).toBe(true)
    })
  })

  it('rejects with the settings already saved and the color mode applied when the restart fails', async () => {
    const { handlers, restartIndexing, store, applyColorMode, settings } = setup()
    restartIndexing.mockRejectedValue(new Error('restart failed'))

    await expect(
      handlers.save({ notesRoot: '/synthetic/new-root', colorMode: 'dark' }, ctx)
    ).rejects.toThrow('restart failed')

    expect(store.update).toHaveBeenCalledTimes(1)
    expect(settings.notesRoot).toBe('/synthetic/new-root')
    expect(applyColorMode).toHaveBeenCalledWith('dark')
  })

  it('does not call a provider or read a secret', async () => {
    const { handlers, validateProviderKey, listAuthorizedOpenAIModels, store } = setup()

    await handlers.save({ openaiKey: SECRET }, ctx)

    expect(validateProviderKey).not.toHaveBeenCalled()
    expect(listAuthorizedOpenAIModels).not.toHaveBeenCalled()
    expect(store.getSecret).not.toHaveBeenCalled()
  })
})

describe('settingsPatchRequiresIndexerRestart', () => {
  const settings = (overrides: Record<string, unknown> = {}): SettingsFile =>
    ({ ...baseSettings, ...overrides }) as unknown as SettingsFile

  it.each([
    ['the notes root changed', {}, { notesRoot: '/other' }, true],
    ['the semantic index switched on', {}, { semanticIndexEnabled: true }, true],
    ['the embedding provider changed', {}, { embeddingProvider: 'anthropic' }, true],
    ['the embedding model changed', {}, { embeddingModel: 'text-embedding-3-large' }, true],
    ['an OpenAI key was supplied', { openaiKey: 'k' }, {}, true],
    ['the OpenAI key was deleted', { deleteProviderKeys: ['openai'] }, {}, true],
    [
      'the OpenAI key was deleted with another',
      { deleteProviderKeys: ['gemini', 'openai'] },
      {},
      true
    ],
    [
      'the agreement to send notes to a provider was given',
      {},
      { semanticIndexAcknowledgement: { acknowledgedAt: 't', provider: 'openai', model: 'm' } },
      true
    ],
    ['nothing relevant changed', { colorMode: 'dark' }, {}, false],
    ['an Anthropic key was supplied', { anthropicKey: 'k' }, {}, false],
    ['a Gemini key was supplied', { geminiKey: 'k' }, {}, false],
    ['another key was deleted', { deleteProviderKeys: ['anthropic'] }, {}, false],
    ['no key was deleted', { deleteProviderKeys: [] }, {}, false],
    ['an empty patch', {}, {}, false]
  ] as const)('%s', (_label, patch, afterChanges, expected) => {
    expect(
      settingsPatchRequiresIndexerRestart(patch as never, settings(), settings(afterChanges))
    ).toBe(expected)
  })

  it('restarts when the agreement is taken back or covers another model, and not when only its date changes', () => {
    const agreed = (model: string, acknowledgedAt = 't'): Record<string, unknown> => ({
      semanticIndexAcknowledgement: { acknowledgedAt, provider: 'openai', model }
    })

    expect(settingsPatchRequiresIndexerRestart({}, settings(agreed('a')), settings())).toBe(true)
    expect(
      settingsPatchRequiresIndexerRestart({}, settings(agreed('a')), settings(agreed('b')))
    ).toBe(true)
    expect(
      settingsPatchRequiresIndexerRestart({}, settings(agreed('a')), settings(agreed('a', 'later')))
    ).toBe(false)
  })

  it('compares the settings before and after, not the patch, for the notes root', () => {
    // A patch that names the notes root already stored changes nothing.
    expect(
      settingsPatchRequiresIndexerRestart({ notesRoot: '/notes' }, settings(), settings())
    ).toBe(false)
  })
})

describe('validateKey', () => {
  it('returns the fixed result and does nothing else when there is no saved key', async () => {
    const { handlers, secrets, validateProviderKey, store } = setup()
    secrets.anthropic = null

    await expect(handlers.validateKey({ provider: 'anthropic' }, ctx)).resolves.toStrictEqual({
      ok: false,
      provider: 'anthropic',
      validatedAt: null,
      error: 'No saved API key to validate.'
    })
    expect(validateProviderKey).not.toHaveBeenCalled()
    expect(store.markKeyValidated).not.toHaveBeenCalled()
  })

  it('validates the saved key and records when it passed', async () => {
    const { handlers, validateProviderKey, store } = setup()

    const result = await handlers.validateKey({ provider: 'openai' }, ctx)

    expect(validateProviderKey).toHaveBeenCalledWith('openai', SECRET)
    expect(store.markKeyValidated).toHaveBeenCalledWith('openai', '2026-11-02T00:00:00.000Z')
    expect(result).toStrictEqual({
      ok: true,
      provider: 'openai',
      validatedAt: '2026-11-02T00:00:00.000Z'
    })
  })

  it.each([
    ['a failed check', { ok: false, provider: 'openai', validatedAt: null, error: 'rejected' }],
    ['a pass without a time', { ok: true, provider: 'openai', validatedAt: null }],
    [
      'a failed check that still carries a time',
      { ok: false, provider: 'openai', validatedAt: '2026-11-02T00:00:00.000Z', error: 'rejected' }
    ]
  ] as const)(
    'records nothing for %s, and returns the result unchanged',
    async (_label, result) => {
      const { handlers, validateProviderKey, store } = setup()
      validateProviderKey.mockResolvedValue(result)

      await expect(handlers.validateKey({ provider: 'openai' }, ctx)).resolves.toBe(result)
      expect(store.markKeyValidated).not.toHaveBeenCalled()
    }
  )
})

describe('listModels', () => {
  it.each(['anthropic', 'gemini'] as const)(
    'rejects %s without reading a key',
    async (provider) => {
      const { handlers, store, listAuthorizedOpenAIModels } = setup()

      await expect(handlers.listModels({ provider }, ctx)).rejects.toThrow(
        'Model discovery is not available for this provider'
      )
      expect(store.getSecret).not.toHaveBeenCalled()
      expect(listAuthorizedOpenAIModels).not.toHaveBeenCalled()
    }
  )

  it('rejects when there is no saved key', async () => {
    const { handlers, secrets, listAuthorizedOpenAIModels } = setup()
    secrets.openai = null

    await expect(handlers.listModels({ provider: 'openai' }, ctx)).rejects.toThrow(
      'No saved API key to list models'
    )
    expect(listAuthorizedOpenAIModels).not.toHaveBeenCalled()
  })

  it('lists with the saved key, remembers the list, and returns it', async () => {
    const { handlers, listAuthorizedOpenAIModels, store } = setup()

    await expect(handlers.listModels({ provider: 'openai' }, ctx)).resolves.toEqual([
      'gpt-5.2',
      'gpt-5.1'
    ])
    expect(listAuthorizedOpenAIModels).toHaveBeenCalledWith(SECRET)
    expect(store.recordDiscoveredOpenAIModels).toHaveBeenCalledWith(['gpt-5.2', 'gpt-5.1'])
  })

  it.each([
    ['replaced', 'another-synthetic-key'],
    ['removed', null]
  ] as const)(
    'rejects, and remembers nothing, when the key was %s while the request ran',
    async (_label, later) => {
      const { handlers, secrets, listAuthorizedOpenAIModels, store } = setup()
      listAuthorizedOpenAIModels.mockImplementation(async () => {
        secrets.openai = later
        return ['gpt-5.2']
      })

      await expect(handlers.listModels({ provider: 'openai' }, ctx)).rejects.toThrow(
        'Your API key changed while the models were loading. Refresh again.'
      )
      expect(store.recordDiscoveredOpenAIModels).not.toHaveBeenCalled()
    }
  )

  it('still returns the models when remembering them fails', async () => {
    const { handlers, store } = setup()
    store.recordDiscoveredOpenAIModels.mockImplementation(() => {
      throw new Error('disk full')
    })

    await expect(handlers.listModels({ provider: 'openai' }, ctx)).resolves.toEqual([
      'gpt-5.2',
      'gpt-5.1'
    ])
  })

  it("passes the provider's own error through", async () => {
    const { handlers, listAuthorizedOpenAIModels } = setup()
    listAuthorizedOpenAIModels.mockRejectedValue(new Error('401'))

    await expect(handlers.listModels({ provider: 'openai' }, ctx)).rejects.toThrow('401')
  })
})

describe('credentials', () => {
  const channels = ['log', 'info', 'warn', 'error', 'debug'] as const
  let spies: ReturnType<typeof vi.spyOn>[]

  beforeEach(() => {
    spies = channels.map((channel) =>
      vi.spyOn(console, channel).mockImplementation(() => undefined)
    )
  })
  afterEach(() => {
    for (const spy of spies) spy.mockRestore()
  })

  it('writes no log line, and no error or result carries the key, through every operation', async () => {
    const { handlers, listAuthorizedOpenAIModels, validateProviderKey, secrets } = setup()
    const outcomes: unknown[] = []
    const record = async (run: () => unknown): Promise<void> => {
      try {
        outcomes.push(await run())
      } catch (error) {
        outcomes.push(error instanceof Error ? error.message : String(error))
      }
    }

    await record(() => handlers.getState(undefined, ctx))
    await record(() => handlers.save({ openaiKey: SECRET, colorMode: 'dark' }, ctx))
    await record(() => handlers.validateKey({ provider: 'openai' }, ctx))
    await record(() => handlers.listModels({ provider: 'openai' }, ctx))
    await record(() => handlers.listModels({ provider: 'anthropic' }, ctx))
    secrets.openai = null
    await record(() => handlers.validateKey({ provider: 'openai' }, ctx))
    await record(() => handlers.listModels({ provider: 'openai' }, ctx))
    secrets.openai = SECRET
    listAuthorizedOpenAIModels.mockRejectedValue(new Error('upstream refused'))
    validateProviderKey.mockRejectedValue(new Error('upstream refused'))
    await record(() => handlers.listModels({ provider: 'openai' }, ctx))
    await record(() => handlers.validateKey({ provider: 'openai' }, ctx))

    expect(JSON.stringify(outcomes)).not.toContain(SECRET)
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})
