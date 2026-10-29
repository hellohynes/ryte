<script setup lang="ts">
import StIcon from '../stencil/icons/StIcon.vue'

defineEmits<{
  search: []
}>()
</script>

<template>
  <button
    type="button"
    class="sidebar-search-button"
    aria-keyshortcuts="Meta+K"
    @click="$emit('search')"
  >
    <StIcon name="search" :size="18" />
    <span>Search documents</span>
  </button>
</template>

<style scoped>
.sidebar-search-button {
  width: 100%;
  height: 2.5em;
  display: flex;
  align-items: center;
  gap: 0.75em;
  box-sizing: border-box;
  border: var(--st-border-100) solid var(--st-color-border-base);
  border-radius: 0.5em;
  padding: 0.5em;
  background: var(--st-color-surface-sunken);
  color: var(--st-color-text-muted);
  font: inherit;
  font-size: var(--st-type-body-sm-size);
  line-height: var(--st-type-body-sm-leading);
  text-align: left;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.sidebar-search-button:hover,
.sidebar-search-button:focus-visible {
  border-color: var(--st-color-border-strong);
  background: var(--st-color-surface-hover);
  color: var(--st-color-text-strong);
  outline: 0;
}

.sidebar-search-button :deep(.ryte-svg-icon) {
  width: var(--st-block-175);
  height: var(--st-block-175);
}

.sidebar-search-button span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
