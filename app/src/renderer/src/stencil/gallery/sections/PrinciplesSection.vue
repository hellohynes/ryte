<script setup lang="ts">
const RULES: Array<[label: string, value: string]> = [
  ['Prefix', '--st-*  ·  st-*  ·  St*  ·  data-st-*'],
  ['Root', '10px  ·  --st-root-size'],
  ['Units', 'rem  ·  em for own text  ·  lh and ch for rhythm and measure'],
  ['Scale', 'stop = base × 100'],
  ['Color', '--st-color-<property>-<variant>'],
  ['Theme', 'prefers-color-scheme  ·  data-theme'],
  ['Type', 'font-size-adjust: 0.53']
]
</script>

<template>
  <section id="principles">
    <header>
      <span class="g-mono">01.</span>
      <h2>Principles</h2>
    </header>
    <p class="g-lede">Rules every token follows.</p>
    <dl class="g-rules">
      <div v-for="[label, value] in RULES" :key="label" class="g-rule">
        <dt>{{ label }}</dt>
        <dd class="g-mono">{{ value }}</dd>
      </div>
    </dl>
  </section>
</template>
