<script setup lang="ts">
import { computed } from 'vue'

import StButton from '../stencil/components/StButton.vue'
import StNotice from '../stencil/components/StNotice.vue'
import { freshnessNoticeCopy } from './research-trace-model'

const props = defineProps<{
  generatedAt: number
  relevantCount: number
  canUpdate: boolean
}>()

const emit = defineEmits<{ update: []; keep: [] }>()

const copy = computed(() => freshnessNoticeCopy(props.generatedAt, props.relevantCount))
</script>

<template>
  <StNotice aria-label="Summary may be outdated">
    <p>
      Content related to this has been added since this summary was generated on
      <strong>{{ copy.generated }}.</strong><br />
      {{ copy.question }}
    </p>
    <p v-if="!canUpdate" class="notice-hint">
      Set up an answer provider in Preferences to update summaries.
    </p>
    <template #actions>
      <StButton variant="ghost" @click="emit('keep')">Keep current</StButton>
      <StButton
        variant="primary"
        :disabled="!canUpdate"
        :title="canUpdate ? undefined : 'Set up an answer provider to update summaries'"
        @click="emit('update')"
      >
        Update summary
      </StButton>
    </template>
  </StNotice>
</template>

<style scoped>
.notice-hint {
  color: var(--st-color-text-tertiary);
  font: var(--st-type-body-sm);
}
</style>
