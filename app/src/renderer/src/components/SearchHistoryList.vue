<script setup lang="ts">
import StButton from '../stencil/components/StButton.vue'
import { hasSavedSearchSnapshot, type HistoryEntry } from '../stores/search-history'
import { historyOptionId } from './search-result-model'

defineProps<{
  entries: HistoryEntry[]
  activeIndex: number
  listId: string
}>()

const emit = defineEmits<{ select: [entry: HistoryEntry]; hover: [index: number]; clear: [] }>()
</script>

<template>
  <section class="history" aria-label="Recent searches">
    <template v-if="entries.length > 0">
      <div class="history-header">
        <h2 class="history-label">Recent searches</h2>
        <StButton variant="ghost" size="sm" @click="emit('clear')">Clear</StButton>
      </div>
      <ul :id="listId" class="history-list" role="listbox" aria-label="Recent searches">
        <li
          v-for="(entry, index) in entries"
          :id="historyOptionId(listId, index)"
          :key="entry.id"
          class="history-row"
          :class="{ active: index === activeIndex }"
          role="option"
          :aria-selected="index === activeIndex"
          @mousemove="emit('hover', index)"
          @click="emit('select', entry)"
        >
          <span class="history-content">
            <span class="history-query">{{ entry.query }}</span>
            <span v-if="hasSavedSearchSnapshot(entry)" class="history-meta">Saved summary</span>
          </span>
        </li>
      </ul>
    </template>
    <p v-else class="history-empty">
      No recent searches yet. Ask a question about your notes to get started.
    </p>
  </section>
</template>

<style scoped>
.history {
  display: flex;
  flex-direction: column;
  gap: var(--st-space-25);
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--st-space-25) var(--st-space-125);
}

.history-label {
  color: var(--sp-text-2);
  font-size: var(--st-type-body-sm-size);
  font-weight: var(--st-type-body-sm-weight);
  line-height: var(--st-type-body-sm-leading);
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: var(--st-space-25);
  padding: 0;
}

.history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--st-space-150);
  min-height: var(--st-block-400);
  padding: var(--st-space-75) var(--st-space-125);
  border-radius: var(--st-space-100);
  cursor: pointer;
}

.history-row.active {
  background: var(--sp-hover);
}

.history-content {
  display: flex;
  align-items: baseline;
  gap: var(--st-space-100);
  min-width: 0;
  line-height: var(--st-line-height-200);
}

.history-query {
  overflow: hidden;
  color: var(--sp-text);
  font-size: var(--st-type-body-md-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-meta {
  flex: 0 0 auto;
  color: var(--sp-text-3);
  font-size: var(--st-type-caption-md-size);
}

.history-empty {
  padding: var(--st-space-75) var(--st-space-125);
  color: var(--sp-text-3);
  font-size: var(--st-type-body-md-size);
  line-height: var(--st-type-body-md-leading);
}
</style>
