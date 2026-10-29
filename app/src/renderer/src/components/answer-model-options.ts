import { defaultAnswerModelForProvider } from '../../../shared/provider-registry'
import type { AnswerProviderId } from '../../../shared/provider-registry'

export const PREFERRED_OPENAI_MODEL = 'gpt-6-luna'

export interface AnswerModelOption {
  id: string
  label: string
}

interface OptionInput {
  provider: AnswerProviderId
  /** Built-in models for the provider. */
  registry: AnswerModelOption[]
  /** IDs returned by an explicit OpenAI refresh, or null before one. */
  discovered: string[] | null
  selected: string
}

/**
 * Options for the answer-model picker. After an OpenAI refresh every returned ID is listed in the
 * order the provider returned it, with no capability filtering. The current selection always
 * stays visible so a refresh can never silently drop it.
 */
export function answerModelOptions(input: OptionInput): AnswerModelOption[] {
  const known = new Map(input.registry.map((option) => [option.id, option.label]))
  const refreshed = input.provider === 'openai' ? input.discovered : null
  const options: AnswerModelOption[] = refreshed
    ? [...new Set(refreshed)].map((id) => ({ id, label: known.get(id) ?? id }))
    : [...input.registry]

  if (options.some((option) => option.id === input.selected)) return options
  const label = known.get(input.selected) ?? input.selected
  return [
    { id: input.selected, label: refreshed ? `${label} (not in the refreshed list)` : label },
    ...options
  ]
}

interface PreferenceInput {
  selected: string
  /** The user changed the model picker in this Settings session. */
  touched: boolean
  discovered: string[]
}

/**
 * The model to select after a refresh. gpt-6-luna is preferred only while no explicit choice
 * exists: the user has not touched the picker and the saved model is still the built-in default.
 */
export function preferredOpenAIModel(input: PreferenceInput): string {
  const hasExplicitChoice =
    input.touched || input.selected !== defaultAnswerModelForProvider('openai')
  if (hasExplicitChoice) return input.selected
  return input.discovered.includes(PREFERRED_OPENAI_MODEL) ? PREFERRED_OPENAI_MODEL : input.selected
}

export type ModelRefreshResult =
  | { ok: true; models: string[]; selected: string; message: string }
  | { ok: false; message: string }

/**
 * What to show and select once a refresh has been read back from the saved settings. A list that
 * was not saved, or that does not hold the chosen model, must not change the selection: the picker
 * would not list that model, and the key it was chosen for may no longer be the saved one.
 */
export function settleRefresh(
  result: Extract<ModelRefreshResult, { ok: true }>,
  saved: string[] | null,
  current: string
): { message: string; selected: string } {
  if (!saved) {
    return {
      message: `Found ${result.models.length} models, but Ryte could not save the list.`,
      selected: current
    }
  }
  return {
    message: result.message,
    selected: saved.includes(result.selected) ? result.selected : current
  }
}

/** Drops Electron's "Error invoking remote method '...': Error:" wrapper from an IPC failure. */
function ipcErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : ''
  const message = raw.replace(/^Error invoking remote method '[^']*': (Error: )?/, '').trim()
  return message || 'Could not refresh models.'
}

/**
 * Runs an explicit model refresh. The caller supplies `listModels` (the typed preload call), so the
 * key never reaches this code. The current selection is kept unless no explicit choice exists.
 */
export async function refreshOpenAIModels(
  listModels: () => Promise<string[]>,
  current: { selected: string; touched: boolean }
): Promise<ModelRefreshResult> {
  try {
    const models = await listModels()
    const selected = preferredOpenAIModel({ ...current, discovered: models })
    const count = `${models.length} model${models.length === 1 ? '' : 's'}`
    return { ok: true, models, selected, message: `Found ${count} for this key.` }
  } catch (error) {
    return { ok: false, message: ipcErrorMessage(error) }
  }
}
