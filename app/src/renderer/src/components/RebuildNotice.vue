<script setup lang="ts">
import { useRebuildNoticeStore } from '../stores/rebuild-notice'
import StNotice from '../stencil/components/StNotice.vue'

const rebuildNotice = useRebuildNoticeStore()
</script>

<template>
  <div v-if="rebuildNotice.notice" class="rebuild-notice">
    <StNotice
      tone="info"
      :title="rebuildNotice.notice.message"
      dismissible
      @dismiss="rebuildNotice.dismiss()"
    >
      <span class="rebuild-notice-detail">{{ rebuildNotice.notice.detail }}</span>
    </StNotice>
  </div>
</template>

<style scoped>
.rebuild-notice {
  flex: 0 0 auto;
  padding: var(--st-space-100) var(--st-space-175);
  background: var(--st-color-surface-sunken);
  border-top: var(--st-border-100) solid var(--st-color-border-subtle);
}

/* The detail has two short paragraphs for a cloud index; keep the break the main process wrote. */
.rebuild-notice-detail {
  white-space: pre-line;
}
</style>
