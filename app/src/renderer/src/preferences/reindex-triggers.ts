import type { PublicSettingsState, SettingsUpdate } from '../../../main/settings/settings-store'

type IndexSettings = Pick<
  PublicSettingsState,
  'notesRoot' | 'semanticIndexEnabled' | 'embeddingProvider' | 'embeddingModel'
>

/**
 * Whether saving this patch should start a reindex from here. A patch carries only the fields a control
 * changed, so a field that is absent says nothing and only a field that differs counts. A different notes
 * folder is not one of them: the main process starts that reindex itself once the indexer has restarted.
 */
export function patchRequiresReindex(current: IndexSettings, patch: SettingsUpdate): boolean {
  const changes = <K extends keyof IndexSettings>(key: K): boolean =>
    patch[key] !== undefined && patch[key] !== current[key]
  return (
    changes('semanticIndexEnabled') ||
    changes('embeddingProvider') ||
    changes('embeddingModel') ||
    // The OpenAI key is only what embeds while semantic search is on.
    (current.semanticIndexEnabled &&
      (patch.openaiKey !== undefined || patch.deleteProviderKeys?.includes('openai') === true))
  )
}
