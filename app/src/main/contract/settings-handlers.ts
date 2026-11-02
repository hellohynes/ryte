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
  /** Re-initialises the indexer and restarts the watcher; see `createIndexerRestarter`. */
  restartIndexing: () => Promise<void>
  validateProviderKey: (
    provider: ProviderId,
    apiKey: string
  ) => Promise<ProviderKeyValidationResult>
  listAuthorizedOpenAIModels: (apiKey: string) => Promise<string[]>
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
    before.embeddingModel !== after.embeddingModel
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
      if (settingsPatchRequiresIndexerRestart(patch, previousSettings, store.load())) {
        // Re-init indexer and restart watcher so new notesRoot / embedding settings take effect.
        await restartIndexing()
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
