<script setup lang="ts">
import { computed, ref } from 'vue'

import type { IconName } from '../../icons/icons.generated'
import { ICON_VARIANTS, ICON_WEIGHTS } from '../icon-variants.generated'
import { ICON_GROUPS } from '../gallery-model'

const SIZES = [16, 24, 48]
const weight = ref<number>(1.5)
const paths = computed<Record<IconName, string>>(() => ICON_VARIANTS[String(weight.value)]!)
</script>

<template>
  <section id="icons">
    <header>
      <span class="g-mono">05.</span>
      <h2>Iconography</h2>
    </header>
    <p class="g-lede">16px grid, flat caps, outlined shapes in currentColor.</p>

    <div class="g-controls">
      <div class="g-seg" role="group" aria-label="Weight">
        <span>Weight</span>
        <button
          v-for="w in ICON_WEIGHTS"
          :key="w"
          type="button"
          :aria-pressed="weight === w"
          @click="weight = w"
        >
          {{ w }}
        </button>
      </div>
    </div>

    <div v-for="group in ICON_GROUPS" :key="group.title" class="g-sub">
      <h3>{{ group.title }}</h3>
      <div class="g-icons">
        <div v-for="name in group.names" :key="name" class="g-icon">
          <div class="g-icon-art">
            <svg
              v-for="size in SIZES"
              :key="size"
              class="ryte-svg-icon"
              :width="size"
              :height="size"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path :d="paths[name]" />
            </svg>
          </div>
          <span class="g-mono">{{ name }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
