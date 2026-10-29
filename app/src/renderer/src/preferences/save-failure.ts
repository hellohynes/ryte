import { ref, shallowRef, type Ref, type ShallowRef } from 'vue'

import type { SettingsPatch } from './ai-tools-model'

export interface SaveFailure {
  /** Why the save failed, in words the reader can act on. */
  message: string
  /** What was being saved, kept so the notice can offer to try again. Empty once `keyLost`. */
  patch: SettingsPatch
  /**
   * The failed save held an API key and the window closed, so the key was wiped from memory. There
   * is nothing left to retry; the reader has to paste the key again.
   */
  keyLost?: true
}

export interface SaveFailures {
  /** The notice to show, or null when nothing is waiting on the reader. */
  failure: ShallowRef<SaveFailure | null>
  /** Goes up on every failed save, so a control can put back the value that is actually saved. */
  revision: Ref<number>
  /** Saves a patch. A failure becomes the notice; a save that supersedes it clears it. */
  commit: (patch: SettingsPatch) => Promise<boolean>
  /** Dismisses the notice and tries the failed change again. A second failure shows a fresh notice. */
  retry: () => Promise<boolean>
  /** Clears the notice without saving anything. */
  dismiss: () => void
  /**
   * The window closed: a failed save that holds an API key loses the key (and with it the Retry),
   * and a key that fails later is wiped as it arrives. The notice stays, so a key that did not
   * save is never silently forgotten, and nothing secret outlives the window in memory.
   */
  seal: () => void
  /** The window opened again: failures keep what they need for Retry. */
  unseal: () => void
}

const SECRET_FIELDS = ['openaiKey', 'anthropicKey', 'geminiKey'] as const

function holdsASecret(patch: SettingsPatch): boolean {
  return SECRET_FIELDS.some((field) => field in patch)
}

const KEY_FIELDS = ['openaiKey', 'anthropicKey', 'geminiKey', 'deleteProviderKeys'] as const

function changesAKey(patch: SettingsPatch): boolean {
  return KEY_FIELDS.some((field) => field in patch)
}

function overlaps(a: SettingsPatch, b: SettingsPatch): boolean {
  return Object.keys(a).some((key) => key in b)
}

/**
 * One notice for every Preferences control. A control changes on screen before its save finishes, so
 * a failed save must both say so and put the control back, or it would keep showing a value that
 * was never saved.
 */
export function createSaveFailures(save: (patch: SettingsPatch) => Promise<void>): SaveFailures {
  // Shallow: the patch must come back out as the plain object it went in as. A deep ref hands back a
  // reactive proxy, which cannot be cloned across the IPC bridge, so every retry would fail.
  const failure = shallowRef<SaveFailure | null>(null)
  const revision = ref(0)
  let sealed = false

  function forgetSecrets(pending: SaveFailure): SaveFailure {
    return holdsASecret(pending.patch)
      ? { message: pending.message, patch: {}, keyLost: true }
      : pending
  }

  async function commit(patch: SettingsPatch): Promise<boolean> {
    try {
      await save(patch)
      // A failed change is only worth retrying while nothing has since replaced what it would set.
      // Saving any of the same settings does that, and so does changing a key, which decides what
      // else may be on (semantic search with no OpenAI key, say).
      const pending = failure.value
      if (pending && (changesAKey(patch) || overlaps(patch, pending.patch))) failure.value = null
      return true
    } catch (e) {
      // The latest failure only: its control is the one the reader just changed, and an older
      // change replayed with it could undo what was chosen since.
      const next = { message: e instanceof Error ? e.message : String(e), patch }
      failure.value = sealed ? forgetSecrets(next) : next
      revision.value += 1
      return false
    }
  }

  async function retry(): Promise<boolean> {
    const pending = failure.value
    if (!pending) return true
    // Nothing to replay: the key it held is gone.
    if (pending.keyLost) return false
    failure.value = null
    return commit(pending.patch)
  }

  function dismiss(): void {
    failure.value = null
  }

  function seal(): void {
    sealed = true
    if (failure.value) failure.value = forgetSecrets(failure.value)
  }

  function unseal(): void {
    sealed = false
  }

  return { failure, revision, commit, retry, dismiss, seal, unseal }
}
