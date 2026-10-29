<script setup lang="ts">
/** A color swatch with its name and the lines under it. The fill sits on the base surface so translucent tokens read true. */
defineProps<{
  name: string
  /** A CSS color or a `var()` reference. */
  fill: string
  lines: string[]
  base?: boolean
  /** Draw the color as an edge, for border tokens. */
  ring?: boolean
}>()
</script>

<template>
  <div class="g-swatch">
    <div class="g-swatch-fill" :class="{ base, ring }" :style="{ '--fill': fill }" />
    <b>{{ name }}</b>
    <span v-for="line in lines" :key="line" class="g-mono">{{ line }}</span>
  </div>
</template>
