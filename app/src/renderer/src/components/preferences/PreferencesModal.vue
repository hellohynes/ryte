<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import StDialog from '../../stencil/components/StDialog.vue'
import StButton from '../../stencil/components/StButton.vue'
import StIconButton from '../../stencil/components/StIconButton.vue'
import StNotice from '../../stencil/components/StNotice.vue'

import { usePreferenceSaves } from '../../preferences/use-preference-saves'
import { useSettingsStore } from '../../stores/settings'
import AiToolsPane from './AiToolsPane.vue'
import AppearancePane from './AppearancePane.vue'
import ContentPane from './ContentPane.vue'
import './preferences.css'

withDefaults(defineProps<{ dismissable?: boolean }>(), { dismissable: true })
const emit = defineEmits<{ close: [] }>()

const TABS = [
  { id: 'content', label: 'Content' },
  { id: 'ai-tools', label: 'AI Tools' },
  { id: 'appearance', label: 'Appearance' }
] as const
type TabId = (typeof TABS)[number]['id']

const settings = useSettingsStore()
const { failure, retry, dismiss, seal, unseal } = usePreferenceSaves()
const active = ref<TabId>('content')
const dialog = ref<InstanceType<typeof StDialog> | null>(null)
const tabButtons = ref<HTMLButtonElement[]>([])
const appVersion = ref('')

onMounted(async () => {
  unseal()
  const versionPromise = window.ryte.app.getVersion()
  if (!settings.state) await settings.hydrate()
  appVersion.value = await versionPromise
})

onBeforeUnmount(seal)

// Leaving a field the usual way saves what was typed in it; closing the window should too.
function close(): void {
  if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
  emit('close')
}

async function retrySave(): Promise<void> {
  // The notice disappears when Retry is pressed; keep focus inside the window.
  const pending = retry()
  await nextTick()
  dialog.value?.el?.focus()
  await pending
}

function select(id: TabId): void {
  active.value = id
}

/** Up and Down (or Left and Right) move between sections; Home and End jump to the ends. */
function onTabKeydown(event: KeyboardEvent, index: number): void {
  const last = TABS.length - 1
  const target =
    event.key === 'ArrowDown' || event.key === 'ArrowRight'
      ? (index + 1) % TABS.length
      : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
        ? (index - 1 + TABS.length) % TABS.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : null
  if (target === null) return
  event.preventDefault()
  select(TABS[target]!.id)
  tabButtons.value[target]?.focus()
}
</script>

<template>
  <!-- Appearance changes the app behind the modal, so that section drops the dimming to show it. -->
  <StDialog
    ref="dialog"
    labelledby="pf-title"
    focus="dialog"
    :scrim="active === 'appearance' ? 'clear' : 'dim'"
    :dismissable="dismissable"
    @dismiss="close"
  >
    <div class="pf-modal">
      <header class="pf-header">
        <h1 id="pf-title" class="pf-title">Preferences</h1>
        <StIconButton
          v-if="dismissable"
          icon="close"
          label="Close preferences"
          size="lg"
          @click="emit('close')"
        />
      </header>

      <div class="pf-body">
        <nav class="pf-nav" aria-label="Preferences sections">
          <div role="tablist" aria-orientation="vertical" class="pf-tabs">
            <button
              v-for="(tab, index) in TABS"
              :id="`pf-tab-${tab.id}`"
              :key="tab.id"
              :ref="(el) => (tabButtons[index] = el as HTMLButtonElement)"
              type="button"
              role="tab"
              class="pf-tab"
              :aria-selected="active === tab.id"
              :aria-controls="active === tab.id ? `pf-panel-${tab.id}` : undefined"
              :tabindex="active === tab.id ? 0 : -1"
              @click="select(tab.id)"
              @keydown="onTabKeydown($event, index)"
            >
              {{ tab.label }}
            </button>
          </div>
          <p class="pf-version">Ryte {{ appVersion }}</p>
        </nav>

        <div
          :id="`pf-panel-${active}`"
          class="pf-panel ryte-scrollbar ryte-scrollbar--y"
          role="tabpanel"
          :aria-labelledby="`pf-tab-${active}`"
        >
          <template v-if="settings.state">
            <ContentPane v-if="active === 'content'" :state="settings.state" />
            <AiToolsPane v-else-if="active === 'ai-tools'" :state="settings.state" />
            <AppearancePane v-else :state="settings.state" />
          </template>
          <StNotice v-else-if="settings.error" tone="danger" variant="inline" class="pf-error">{{
            settings.error
          }}</StNotice>
        </div>
      </div>

      <!-- A save that failed: the control is back on its saved value; Retry dismisses this and tries again. -->
      <StNotice v-if="failure" tone="danger" class="pf-notice">
        <template v-if="failure.keyLost">
          Your API key wasn’t saved. {{ failure.message }} Paste it again.
        </template>
        <template v-else>Couldn’t save that change. {{ failure.message }}</template>
        <template #actions>
          <StButton v-if="failure.keyLost" size="sm" @click="dismiss">Dismiss</StButton>
          <StButton v-else size="sm" @click="retrySave">Retry</StButton>
        </template>
      </StNotice>
    </div>
  </StDialog>
</template>

<style scoped>
.pf-modal {
  display: flex;
  flex-direction: column;
  width: min(var(--st-layout-1300), 100%);
  height: min(var(--st-layout-1150), 100%);
  overflow: hidden;
  border-radius: var(--st-space-200);
  background: var(--st-color-surface-base);
  box-shadow: var(--st-shadow-lg);
  color: var(--st-color-text-primary);
  font-size: var(--st-type-body-md-size);
}

.pf-header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: var(--st-space-100);
  padding: var(--st-space-250) var(--st-space-250) var(--st-space-250) var(--st-space-300);
  border-bottom: var(--st-border-100) solid var(--st-color-border-base);
}

.pf-title {
  margin: 0;
  font-size: var(--st-type-headline-lg-size);
  font-weight: var(--st-type-headline-lg-weight);
  line-height: var(--st-type-headline-lg-leading);
}

.pf-tab:focus-visible {
  outline: var(--st-border-200) solid var(--st-color-focus);
  outline-offset: var(--st-space-25);
}

.pf-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  gap: var(--st-space-250);
}

.pf-nav {
  display: flex;
  flex: 0 0 var(--st-layout-350);
  flex-direction: column;
  justify-content: space-between;
  padding: var(--st-space-125) var(--st-space-150);
}

.pf-tabs {
  display: flex;
  flex-direction: column;
  gap: var(--st-space-25);
}

.pf-tab {
  padding: var(--st-space-75) var(--st-space-150);
  border: 0;
  border-radius: var(--st-space-100);
  background: transparent;
  color: var(--st-color-text-primary);
  font: inherit;
  font-size: var(--st-type-label-lg-size);
  font-weight: var(--st-type-label-lg-weight);
  line-height: var(--st-type-label-lg-leading);
  text-align: left;
  cursor: pointer;
}

.pf-tab:hover:not([aria-selected='true']) {
  background: var(--st-color-surface-hover);
}

.pf-tab[aria-selected='true'] {
  background: var(--st-color-accent-fill);
  color: var(--st-color-text-contrast);
}

.pf-version {
  margin: 0;
  padding: 0 var(--st-space-150);
  color: var(--st-color-text-muted);
  font-size: var(--st-type-body-sm-size);
}

.pf-notice {
  flex: 0 0 auto;
  margin: 0 var(--st-space-300) var(--st-space-150);
}

.pf-panel {
  flex: 1 1 auto;
  min-width: 0;
  overflow-y: auto;
  padding-bottom: var(--st-space-200);
}

@media (max-width: 760px) {
  .pf-body {
    flex-direction: column;
    gap: 0;
  }

  .pf-nav {
    flex: 0 0 auto;
    flex-direction: row;
    align-items: center;
    padding: var(--st-space-100) var(--st-space-150);
  }

  .pf-tabs {
    flex-direction: row;
  }

  .pf-version {
    display: none;
  }
}
</style>
