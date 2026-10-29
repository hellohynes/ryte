<script setup lang="ts">
/** A flex stack with token-only gap, direction, alignment, and wrapping. */
import { computed } from 'vue'

import { stackAttributes, type StackProps } from './layout-props'

const props = withDefaults(defineProps<StackProps & { as?: string }>(), { as: 'div' })
const attrs = computed(() => stackAttributes(props))
</script>

<template>
  <component :is="as" class="st-stack" v-bind="attrs"><slot /></component>
</template>
