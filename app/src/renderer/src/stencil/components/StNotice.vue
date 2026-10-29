<script setup lang="ts">
/** A message about the state of something. Tones info, success, warning, danger; boxed or inline; optional title, dismiss button, and actions slot. Danger announces as an alert, the rest as status. */
import { computed } from 'vue'

import StIconButton from './StIconButton.vue'
import { noticeAttributes, type NoticeProps } from './notice-props'

// Vue casts an absent boolean prop to false; `urgent` must stay undefined to default by tone.
const props = withDefaults(defineProps<NoticeProps>(), { urgent: undefined })
const emit = defineEmits<{ dismiss: [] }>()
const attrs = computed(() => noticeAttributes(props))
</script>

<template>
  <div class="st-notice" v-bind="attrs">
    <div class="st-notice-body">
      <strong v-if="title" class="st-notice-title">{{ title }}</strong>
      <span><slot /></span>
      <div v-if="$slots.actions" class="st-notice-actions"><slot name="actions" /></div>
    </div>
    <StIconButton
      v-if="dismissible"
      icon="close"
      label="Dismiss"
      size="sm"
      @click="emit('dismiss')"
    />
  </div>
</template>
