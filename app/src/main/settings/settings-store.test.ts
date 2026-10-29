import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tempDir: string

vi.mock('electron', () => ({
  app: {
    getPath: (kind: string) => {
      if (kind === 'userData') return tempDir
      if (kind === 'home') return '/Users/test'
      if (kind === 'documents') return '/Users/test/Documents'
      throw new Error(`unexpected getPath: ${kind}`)
    }
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`, 'utf-8'),
    decryptString: (b: Buffer) => b.toString('utf-8').replace(/^enc:/, '')
  }
}))

describe('SettingsStore', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ryte-settings-'))
    vi.resetModules()
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('returns defaults when no file exists', async () => {
    const { settingsStore } = await import('./settings-store')
    const state = settingsStore.publicState()
    expect(state.notesRoot).toBe('/Users/test/Documents/Ryte')
    expect(state.model).toBe('gpt-5.2')
    expect(state.answerProvider).toBe('openai')
    expect(state.answerModel).toBe('gpt-5.2')
    expect(state.embeddingProvider).toBe('openai')
    expect(state.embeddingModel).toBe('text-embedding-3-small')
    expect(state.cloudAnswersEnabled).toBe(false)
    expect(state.semanticIndexEnabled).toBe(false)
    expect(state.firstCloudUseAcknowledgedAt).toBeNull()
    expect(state.cloudAnswersAcknowledgement).toBeNull()
    expect(state.semanticIndexAcknowledgement).toBeNull()
    expect(state.searchHistoryRetention).toBe('30-days')
    // A new install keeps generated summaries with its history, so a past search reopens at once.
    expect(state.searchHistoryIncludesAnswers).toBe(true)
    expect(state.scrollbarVisibility).toBe('auto')
    expect(state.fontFamily).toBe('geist')
    expect(state.colorMode).toBe('system')
    expect(state.hasAnthropicKey).toBe(false)
    expect(state.hasOpenAIKey).toBe(false)
    expect(state.hasGeminiKey).toBe(false)
    expect(state.providerKeyMetadata).toEqual({})
    expect(state.keychainAvailable).toBe(true)
  })

  it('persists notes root and model on update', async () => {
    const { settingsStore, SettingsStore } = await import('./settings-store')
    settingsStore.update({
      notesRoot: '/tmp/notes',
      answerProvider: 'anthropic',
      answerModel: 'claude-sonnet-4-6'
    })
    const fresh = new SettingsStore()
    const state = fresh.publicState()
    expect(state.notesRoot).toBe('/tmp/notes')
    expect(state.model).toBe('claude-sonnet-4-6')
    expect(state.answerProvider).toBe('anthropic')
  })

  it('encrypts api keys round-trip via keychain', async () => {
    const { settingsStore, SettingsStore } = await import('./settings-store')
    settingsStore.update({
      anthropicKey: 'sk-ant-xyz',
      openaiKey: 'sk-openai-abc',
      geminiKey: 'gemini-abc'
    })

    const fresh = new SettingsStore()
    const state = fresh.publicState()
    expect(state.hasAnthropicKey).toBe(true)
    expect(state.hasOpenAIKey).toBe(true)
    expect(state.hasGeminiKey).toBe(true)
    expect(fresh.getSecret('anthropic')).toBe('sk-ant-xyz')
    expect(fresh.getSecret('openai')).toBe('sk-openai-abc')
    expect(fresh.getSecret('gemini')).toBe('gemini-abc')
  })

  it('persists cloud and semantic capability settings', async () => {
    const { settingsStore, SettingsStore } = await import('./settings-store')
    settingsStore.update({
      cloudAnswersEnabled: true,
      semanticIndexEnabled: true,
      cloudAnswersAcknowledgement: {
        acknowledgedAt: '2026-05-19T12:00:00.000Z',
        provider: 'openai',
        model: 'gpt-5.2'
      },
      semanticIndexAcknowledgement: {
        acknowledgedAt: '2026-05-19T12:01:00.000Z',
        provider: 'openai',
        model: 'text-embedding-3-small'
      },
      searchHistoryRetention: '7-days',
      searchHistoryIncludesAnswers: true,
      scrollbarVisibility: 'always'
    })

    const fresh = new SettingsStore()
    const state = fresh.publicState()
    expect(state.cloudAnswersEnabled).toBe(true)
    expect(state.semanticIndexEnabled).toBe(true)
    expect(state.firstCloudUseAcknowledgedAt).toBe('2026-05-19T12:00:00.000Z')
    expect(state.cloudAnswersAcknowledgement).toEqual({
      acknowledgedAt: '2026-05-19T12:00:00.000Z',
      provider: 'openai',
      model: 'gpt-5.2'
    })
    expect(state.semanticIndexAcknowledgement).toEqual({
      acknowledgedAt: '2026-05-19T12:01:00.000Z',
      provider: 'openai',
      model: 'text-embedding-3-small'
    })
    expect(state.searchHistoryRetention).toBe('7-days')
    expect(state.searchHistoryIncludesAnswers).toBe(true)
    expect(state.scrollbarVisibility).toBe('always')
  })

  it('keeps an existing file without the new settings exactly as it behaved, not switched on', async () => {
    writeFileSync(
      join(tempDir, 'settings.json'),
      JSON.stringify({ schemaVersion: 4, notesRoot: '/tmp/current-notes' }),
      'utf-8'
    )

    const { SettingsStore } = await import('./settings-store')
    const state = new SettingsStore().publicState()

    // Before this option was visible it was off; an upgrade does not start storing summaries.
    expect(state.searchHistoryIncludesAnswers).toBe(false)
    expect(state.fontFamily).toBe('geist')
    expect(state.colorMode).toBe('system')
  })

  it('persists the font and color mode, and falls back when a stored value is not recognised', async () => {
    const { SettingsStore } = await import('./settings-store')
    const store = new SettingsStore()
    store.update({ fontFamily: 'roboto', colorMode: 'dark' })

    const reread = new SettingsStore().publicState()
    expect(reread.fontFamily).toBe('roboto')
    expect(reread.colorMode).toBe('dark')

    writeFileSync(
      join(tempDir, 'settings.json'),
      JSON.stringify({
        schemaVersion: 4,
        notesRoot: '/n',
        fontFamily: 'comic-sans',
        colorMode: 'sepia'
      }),
      'utf-8'
    )
    const fallback = new SettingsStore().publicState()
    expect(fallback.fontFamily).toBe('geist')
    expect(fallback.colorMode).toBe('system')
  })

  it('migrates the legacy single-model settings file', async () => {
    const legacyAnthropicKey = Buffer.from('enc:sk-ant-legacy', 'utf-8').toString('base64')
    writeFileSync(
      join(tempDir, 'settings.json'),
      JSON.stringify({
        notesRoot: '/tmp/legacy-notes',
        model: 'claude-sonnet-4-6',
        encryptedKeys: { anthropic: legacyAnthropicKey }
      }),
      'utf-8'
    )

    const { SettingsStore, SETTINGS_SCHEMA_VERSION } = await import('./settings-store')
    const fresh = new SettingsStore()
    const state = fresh.publicState()
    expect(state.notesRoot).toBe('/tmp/legacy-notes')
    expect(state.answerProvider).toBe('anthropic')
    expect(state.answerModel).toBe('claude-sonnet-4-6')
    expect(state.cloudAnswersEnabled).toBe(false)
    expect(state.semanticIndexEnabled).toBe(false)
    expect(fresh.getSecret('anthropic')).toBe('sk-ant-legacy')
    expect(state.searchHistoryRetention).toBe('30-days')
    expect(state.searchHistoryIncludesAnswers).toBe(false)
    expect(state.scrollbarVisibility).toBe('auto')

    const saved = JSON.parse(readFileSync(join(tempDir, 'settings.json'), 'utf-8')) as {
      schemaVersion: number
      scrollbarVisibility: string
    }
    expect(saved.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION)
    expect(saved.scrollbarVisibility).toBe('auto')
  })

  it('keeps the reference link bases, and drops one that is not a plain https address', async () => {
    writeFileSync(
      join(tempDir, 'settings.json'),
      JSON.stringify({
        schemaVersion: 4,
        notesRoot: '/tmp/current-notes',
        ticketLinkBase: 'https://example.atlassian.net/browse/',
        pullRequestLinkBase: 'javascript:alert(1)'
      }),
      'utf-8'
    )

    const { SettingsStore } = await import('./settings-store')
    const store = new SettingsStore()
    expect(store.publicState().ticketLinkBase).toBe('https://example.atlassian.net/browse/')
    expect(store.publicState().pullRequestLinkBase).toBe('')

    store.update({ pullRequestLinkBase: 'https://github.com/example/repo/pull/' })
    expect(new SettingsStore().publicState().pullRequestLinkBase).toBe(
      'https://github.com/example/repo/pull/'
    )
  })

  it('migrates missing or invalid scrollbar visibility to auto', async () => {
    writeFileSync(
      join(tempDir, 'settings.json'),
      JSON.stringify({
        schemaVersion: 4,
        notesRoot: '/tmp/current-notes',
        scrollbarVisibility: 'visible'
      }),
      'utf-8'
    )

    const { SettingsStore } = await import('./settings-store')
    const state = new SettingsStore().publicState()
    expect(state.notesRoot).toBe('/tmp/current-notes')
    expect(state.scrollbarVisibility).toBe('auto')

    const saved = JSON.parse(readFileSync(join(tempDir, 'settings.json'), 'utf-8')) as {
      scrollbarVisibility: string
    }
    expect(saved.scrollbarVisibility).toBe('auto')
  })

  it('does not include plaintext keys in publicState', async () => {
    const { settingsStore } = await import('./settings-store')
    settingsStore.update({ anthropicKey: 'sk-ant-secret-value' })
    const serialized = JSON.stringify(settingsStore.publicState())
    expect(serialized).not.toContain('sk-ant-secret-value')
  })

  it('migrates the legacy first cloud-use acknowledgement into provider-aware consent', async () => {
    writeFileSync(
      join(tempDir, 'settings.json'),
      JSON.stringify({
        schemaVersion: 2,
        notesRoot: '/tmp/legacy-notes',
        answerProvider: 'anthropic',
        answerModel: 'claude-haiku-4-5',
        firstCloudUseAcknowledgedAt: '2026-05-19T12:00:00.000Z'
      }),
      'utf-8'
    )

    const { SettingsStore } = await import('./settings-store')
    const state = new SettingsStore().publicState()
    expect(state.cloudAnswersAcknowledgement).toEqual({
      acknowledgedAt: '2026-05-19T12:00:00.000Z',
      provider: 'anthropic',
      model: 'claude-haiku-4-5'
    })
  })

  it('deletes provider keys and clears validation metadata', async () => {
    const { settingsStore } = await import('./settings-store')
    settingsStore.update({ openaiKey: 'sk-openai-abc' })
    settingsStore.markKeyValidated('openai', '2026-05-19T12:00:00.000Z')

    const state = settingsStore.update({ deleteProviderKeys: ['openai'] })
    expect(state.hasOpenAIKey).toBe(false)
    expect(settingsStore.getSecret('openai')).toBeNull()
    expect(state.providerKeyMetadata.openai?.lastValidatedAt).toBeNull()
  })

  it('resets key validation metadata when a key is replaced', async () => {
    const { settingsStore } = await import('./settings-store')
    settingsStore.update({ openaiKey: 'sk-openai-abc' })
    settingsStore.markKeyValidated('openai', '2026-05-19T12:00:00.000Z')

    const state = settingsStore.update({ openaiKey: 'sk-openai-next' })
    expect(state.providerKeyMetadata.openai?.lastValidatedAt).toBeNull()
    expect(settingsStore.getSecret('openai')).toBe('sk-openai-next')
  })

  describe('refreshed OpenAI model list', () => {
    it('has none until a refresh has been recorded', async () => {
      const { settingsStore } = await import('./settings-store')
      expect(settingsStore.publicState().discoveredOpenAIModels).toBeNull()
    })

    it('is remembered across a restart, in the order the provider returned it', async () => {
      const first = await import('./settings-store')
      first.settingsStore.recordDiscoveredOpenAIModels(['gpt-6-luna', 'gpt-5.2', 'o3-mini'])

      vi.resetModules()
      const { settingsStore } = await import('./settings-store')

      expect(settingsStore.publicState().discoveredOpenAIModels).toEqual([
        'gpt-6-luna',
        'gpt-5.2',
        'o3-mini'
      ])
    })

    it('drops duplicates, non-strings and over-long ids, and caps the list', async () => {
      const { settingsStore } = await import('./settings-store')
      const many = Array.from({ length: 1500 }, (_, i) => `model-${i}`)

      const state = settingsStore.recordDiscoveredOpenAIModels([
        'gpt-6-luna',
        'gpt-6-luna',
        42 as unknown as string,
        'x'.repeat(300),
        '',
        ...many
      ])

      const saved = state.discoveredOpenAIModels ?? []
      expect(saved[0]).toBe('gpt-6-luna')
      expect(saved.filter((id) => id === 'gpt-6-luna')).toHaveLength(1)
      expect(saved.every((id) => id.length > 0 && id.length <= 200)).toBe(true)
      expect(saved.length).toBe(1000)
    })

    it('ignores a damaged list in the file', async () => {
      writeFileSync(
        join(tempDir, 'settings.json'),
        JSON.stringify({ discoveredOpenAIModels: 'gpt-6-luna' })
      )
      const { settingsStore } = await import('./settings-store')
      expect(settingsStore.publicState().discoveredOpenAIModels).toBeNull()
    })

    it('does not keep an empty list, which would hide every built-in model', async () => {
      const { settingsStore } = await import('./settings-store')
      expect(settingsStore.recordDiscoveredOpenAIModels([]).discoveredOpenAIModels).toBeNull()
    })

    it('belongs to the key that fetched it: a new or removed OpenAI key clears it', async () => {
      const { settingsStore } = await import('./settings-store')
      settingsStore.update({ openaiKey: 'sk-openai-abc' })
      settingsStore.recordDiscoveredOpenAIModels(['gpt-6-luna'])

      expect(settingsStore.update({ anthropicKey: 'sk-ant-1' }).discoveredOpenAIModels).toEqual([
        'gpt-6-luna'
      ])
      expect(
        settingsStore.update({ openaiKey: 'sk-openai-next' }).discoveredOpenAIModels
      ).toBeNull()

      settingsStore.recordDiscoveredOpenAIModels(['gpt-6-luna'])
      expect(
        settingsStore.update({ deleteProviderKeys: ['openai'] }).discoveredOpenAIModels
      ).toBeNull()
    })
  })

  it('throws when keychain is unavailable', async () => {
    const electronMod = await import('electron')
    vi.spyOn(electronMod.safeStorage, 'isEncryptionAvailable').mockReturnValue(false)
    const { SettingsStore } = await import('./settings-store')
    const store = new SettingsStore()
    expect(() => store.update({ anthropicKey: 'sk-ant-xyz' })).toThrow('Keychain unavailable')
  })
})
