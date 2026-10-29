<script setup lang="ts">
/** Text in a type role (`kind` and `size`) and tone, with optional weight, truncation, line clamp, and alignment. Renders a span unless `as` says otherwise. */
import { computed } from 'vue'

import { textAttributes, type TextProps } from './text-props'

const props = withDefaults(defineProps<TextProps & { as?: string }>(), { as: 'span' })
const attrs = computed(() => textAttributes(props))
</script>

<template>
  <component :is="as" class="st-text" v-bind="attrs"><slot /></component>
</template>
