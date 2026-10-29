<script setup lang="ts">
import StSegmented from '../../stencil/components/StSegmented.vue'
import StText from '../../stencil/components/StText.vue'
import StStack from '../../stencil/components/StStack.vue'

import { FONT_OPTIONS, type FontId } from '../../../../shared/fonts'
import { usePreferenceSaves } from '../../preferences/use-preference-saves'
import PrefSelect from './PrefSelect.vue'
import type {
  ColorMode,
  PublicSettingsState,
  ScrollbarVisibility
} from '../../../../main/settings/settings-store'

const props = defineProps<{ state: PublicSettingsState }>()

const { commit } = usePreferenceSaves()

const FONT_CHOICES = FONT_OPTIONS.map((font) => ({ value: font.id, label: font.label }))

const COLOR_MODES: ReadonlyArray<{ value: ColorMode; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

const SCROLLBAR_CHOICES: ReadonlyArray<{ value: ScrollbarVisibility; label: string }> = [
  { value: 'auto', label: 'Automatic (Default)' },
  { value: 'always', label: 'Always show trays' }
]

function setFont(value: string): void {
  void commit({ fontFamily: value as FontId })
}

function setColorMode(value: string): void {
  if (value !== props.state.colorMode) void commit({ colorMode: value as ColorMode })
}

function setScrollbars(value: string): void {
  void commit({ scrollbarVisibility: value as ScrollbarVisibility })
}
</script>

<template>
  <div class="pf-pane">
    <StText as="h2" kind="headline" size="md" class="pf-pane-title">Appearance</StText>

    <section class="pf-section" aria-labelledby="pf-font">
      <StStack :gap="50">
        <StText id="pf-font" as="h3" kind="headline" size="sm">Font</StText>
        <StText as="p" tone="primary" class="pf-desc">
          The typeface for your notes, summaries and code. The rest of Ryte stays in Geist.
        </StText>
      </StStack>
      <div class="pf-field--narrow">
        <PrefSelect
          :model-value="state.fontFamily"
          :options="FONT_CHOICES"
          label="Font"
          @update:model-value="setFont"
        />
      </div>
    </section>

    <section class="pf-section" aria-labelledby="pf-color-mode">
      <StStack :gap="50">
        <StText id="pf-color-mode" as="h3" kind="headline" size="sm">Color Mode</StText>
        <StText as="p" tone="primary" class="pf-desc">
          Choose if Ryte’s appearance should be light or dark, or follow your computer’s settings.
        </StText>
      </StStack>
      <StSegmented
        :model-value="state.colorMode"
        :options="COLOR_MODES"
        label="Color Mode"
        @update:model-value="setColorMode"
      />
    </section>

    <section class="pf-section" aria-labelledby="pf-scrollbars">
      <StStack :gap="50">
        <StText id="pf-scrollbars" as="h3" kind="headline" size="sm">Scrollbars</StText>
        <StText as="p" tone="primary" class="pf-desc"
          >Choose when scrollbar trays are shown.</StText
        >
      </StStack>
      <div class="pf-field--narrow">
        <PrefSelect
          :model-value="state.scrollbarVisibility"
          :options="SCROLLBAR_CHOICES"
          label="Scrollbars"
          @update:model-value="setScrollbars"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.pf-field--narrow {
  width: var(--st-layout-400);
  max-width: 100%;
}
</style>
