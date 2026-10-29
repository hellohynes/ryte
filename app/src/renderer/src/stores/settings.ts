import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { PublicSettingsState } from '../../../main/settings/settings-store'
import type { RyteApi } from '../../../preload'

type SettingsPatch = Parameters<RyteApi['settings']['save']>[0]

export const useSettingsStore = defineStore('settings', () => {
  const state = ref<PublicSettingsState | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function hydrate(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      state.value = await window.ryte.settings.getState()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function save(patch: SettingsPatch): Promise<void> {
    loading.value = true
    error.value = null
    try {
      state.value = await window.ryte.settings.save(patch)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  return { state, loading, error, hydrate, save }
})
