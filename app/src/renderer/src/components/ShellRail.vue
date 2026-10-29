<script setup lang="ts">
import StIconButton from '../stencil/components/StIconButton.vue'

const props = defineProps<{
  sidebarCollapsed: boolean
  showShortcutBadges: boolean
}>()

const emit = defineEmits<{
  toggleSidebar: []
  openSearch: []
  openSettings: []
}>()

function sidebarToggleLabel(): string {
  return props.sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'
}
</script>

<template>
  <nav class="shell-rail" aria-label="Workspace navigation">
    <div class="rail-top">
      <StIconButton
        :icon="sidebarCollapsed ? 'sidebar-open' : 'sidebar'"
        :label="sidebarToggleLabel()"
        size="lg"
        data-workspace-fallback-focus
        :aria-pressed="sidebarCollapsed"
        aria-keyshortcuts="Meta+B Control+T"
        @click="emit('toggleSidebar')"
      >
        <span v-if="showShortcutBadges" class="shortcut-badge" aria-hidden="true">T</span>
      </StIconButton>

      <StIconButton
        icon="search"
        label="Search"
        size="lg"
        aria-keyshortcuts="Meta+K Control+/"
        @click="emit('openSearch')"
      >
        <span v-if="showShortcutBadges" class="shortcut-badge" aria-hidden="true">/</span>
      </StIconButton>

      <StIconButton
        icon="settings"
        label="Preferences"
        size="lg"
        aria-keyshortcuts="Meta+, Control+0"
        @click="emit('openSettings')"
      >
        <span v-if="showShortcutBadges" class="shortcut-badge" aria-hidden="true">0</span>
      </StIconButton>
    </div>
  </nav>
</template>

<style scoped>
.shell-rail {
  width: var(--shell-rail-width);
  height: 100%;
  display: flex;
  flex: 0 0 var(--shell-rail-width);
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  box-sizing: border-box;
  padding: var(--st-space-150) var(--st-space-100);
  color: var(--st-color-text-secondary);
  -webkit-app-region: no-drag;
}

.rail-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--st-space-75);
  width: 100%;
}

.shortcut-badge {
  position: absolute;
  right: var(--st-space-50-negative);
  bottom: var(--st-space-50-negative);
  z-index: 2;
  min-width: var(--st-block-175);
  height: var(--st-block-175);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border-radius: var(--st-space-75);
  padding: 0 var(--st-space-50);
  background: var(--st-color-fill-primary);
  color: var(--st-color-text-on-primary);
  font-size: var(--st-type-caption-sm-size);
  font-weight: var(--st-type-caption-sm-weight);
  line-height: var(--st-type-caption-sm-leading);
  pointer-events: none;
  box-shadow: 0 0 0 var(--st-border-100) var(--st-color-border-subtle);
}
</style>
