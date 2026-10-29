<script setup lang="ts">
/** A text button. Variants primary, secondary, ghost, link, and danger; sizes sm, md, lg; `loading` disables it and marks it busy. */
import { computed } from 'vue'

import { buttonAttributes, type ButtonProps } from './button-props'

const props = withDefaults(defineProps<ButtonProps & { type?: 'button' | 'submit' | 'reset' }>(), {
  type: 'button'
})
const attrs = computed(() => buttonAttributes(props))
</script>

<template>
  <button class="st-button" :type="type" v-bind="attrs"><slot /></button>
</template>
