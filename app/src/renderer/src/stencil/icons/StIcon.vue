<script setup lang="ts">
/** An icon from the Stencil set, drawn as one filled currentColor shape. `name` is a generated icon name; `size` is in px. */
import { ICON_PATHS, type IconName } from './icons.generated'

withDefaults(
  defineProps<{
    name: IconName
    /** Width and height in px. The drawing scales with it. */
    size?: number
  }>(),
  { size: 16 }
)
</script>

<template>
  <svg
    class="ryte-svg-icon st-icon"
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="currentColor"
    aria-hidden="true"
  >
    <path :d="ICON_PATHS[name]" />
  </svg>
</template>
