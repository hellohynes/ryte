<script setup lang="ts">
/** A form field wrapper: label, hint, and error wired to the control by id and aria-describedby. Pass the control through the default slot, which receives { id, describedby, invalid }. */
import { computed, useId } from 'vue'

import StStack from './StStack.vue'
import StText from './StText.vue'
import { fieldIds } from './field-logic'

const props = defineProps<{
  label: string
  hint?: string
  /** An error message. It replaces nothing: the hint stays, and the control is marked invalid. */
  error?: string
}>()

const id = useId()
const ids = computed(() => fieldIds(id, props.hint, props.error))
</script>

<template>
  <StStack :gap="50">
    <StText as="label" kind="label" size="md" tone="primary" :for="ids.control">{{ label }}</StText>
    <slot :id="ids.control" :describedby="ids.describedby" :invalid="Boolean(error)" />
    <StText v-if="hint" :id="ids.hint" as="p" size="sm" tone="muted">{{ hint }}</StText>
    <StText v-if="error" :id="ids.error" as="p" size="sm" tone="danger" role="alert">
      {{ error }}
    </StText>
  </StStack>
</template>
