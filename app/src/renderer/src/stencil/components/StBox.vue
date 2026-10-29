<script setup lang="ts">
/** A surface with token-only padding, border, ring, radius, and shadow. Layout wrapper for cards, panels, and wells. */
import { computed } from 'vue'

import { boxAttributes, type BoxProps } from './layout-props'

const props = withDefaults(defineProps<BoxProps & { as?: string }>(), { as: 'div' })
const attrs = computed(() => boxAttributes(props))
</script>

<template>
  <component :is="as" class="st-box" v-bind="attrs"><slot /></component>
</template>
