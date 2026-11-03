import type { Contract } from '../../contract'
import type {
  ColorMode,
  ProviderId,
  ProviderKeyValidationResult,
  SettingsUpdate
} from '../../contract/settings'
import type { SettingsFile, SettingsStore } from '../settings/settings-store'
import type { Handlers } from './register'

export interface SettingsHandlerDependencies {
  store: Pick<
    SettingsStore,
    | 'load'
    | 'update'
    | 'publicState'
    | 'getSecret'
    | 'markKeyValidated'
    | 'recordDiscoveredOpenAIModels'
  >
  applyColorMode: (mode: ColorMode) => void
  /**
   * Re-initialises the indexer and restarts the watcher; see `createIndexerRestarter`. `reindex` asks it to start an index
   * pass afterwards, which a different notes folder needs and the caller no longer has to arrange.
   */
  restartIndexing: (options: { reindex: boolean }) => Promise<void>
  validateProviderKey: (
    provider: ProviderId,
    apiKey: string
  ) => Promise<ProviderKeyValidationResult>
  listAuthorizedOpenAIModels: (apiKey: string) => Promise<string[]>
}

/** What the indexer needs from the saved agreement to send notes to a provider: that it exists and is for this provider and model. */
function agreementKey(settings: SettingsFile): string | null {
  const agreement = settings.semanticIndexAcknowledgement
  return agreement ? `${agreement.provider}/${agreement.model}` : null
}

/** Whether a settings change means the index has to be rebuilt on a new root, key or embedding choice. */
export function settingsPatchRequiresIndexerRestart(
  patch: SettingsUpdate,
  before: SettingsFile,
  after: SettingsFile
): boolean {
  return (
    before.notesRoot !== after.notesRoot ||
    patch.openaiKey !== undefined ||
    patch.deleteProviderKeys?.includes('openai') === true ||
    before.semanticIndexEnabled !== after.semanticIndexEnabled ||
    before.embeddingProvider !== after.embeddingProvider ||
    before.embeddingModel !== after.embeddingModel ||
    // Main embeds only with the agreement, so taking it back or changing what it covers stops or starts that.
    agreementKey(before) !== agreementKey(after)
  )
}

/**
 * The handlers for the `settings` operations, built from injected dependencies so they run without Electron.
 * Input is already validated. Nothing here logs, and no error carries a key.
 */
export function createSettingsHandlers({
  store,
  applyColorMode,
  restartIndexing,
  validateProviderKey,
  listAuthorizedOpenAIModels
}: SettingsHandlerDependencies): Handlers<Contract>['settings'] {
  return {
    getState: async () => store.publicState(),

    save: async (patch) => {
      const previousSettings = store.load()
      const next = store.update(patch)
      if (patch.colorMode !== undefined) applyColorMode(patch.colorMode)
      const savedSettings = store.load()
      if (settingsPatchRequiresIndexerRestart(patch, previousSettings, savedSettings)) {
        // Re-init indexer and restart watcher so new notesRoot / embedding settings take effect. A different folder is
        // compared as written, like the restart itself: the same folder spelled another way restarts and reindexes once.
        await restartIndexing({ reindex: previousSettings.notesRoot !== savedSettings.notesRoot })
      }
      return next
    },

    validateKey: async ({ provider }) => {
      const apiKey = store.getSecret(provider)
      if (!apiKey) {
        return {
          ok: false,
          provider,
          validatedAt: null,
          error: 'No saved API key to validate.'
        }
      }
      const result = await validateProviderKey(provider, apiKey)
      if (result.ok && result.validatedAt) {
        store.markKeyValidated(provider, result.validatedAt)
      }
      return result
    },

    listModels: async ({ provider }) => {
      if (provider !== 'openai') {
        throw new Error('Model discovery is not available for this provider')
      }
      const apiKey = store.getSecret(provider)
      if (!apiKey) throw new Error('No saved API key to list models')
      const models = await listAuthorizedOpenAIModels(apiKey)
      // The list belongs to the key that fetched it. If the key was replaced or removed while the
      // request ran, the list is for a key that is gone: say so rather than hand it back as current.
      if (store.getSecret(provider) !== apiKey) {
        throw new Error('Your API key changed while the models were loading. Refresh again.')
      }
      try {
        store.recordDiscoveredOpenAIModels(models)
      } catch {
        // Not remembering the list is no reason to lose what was just fetched; the pane notices that
        // it was not saved.
      }
      return models
    }
  }
}
