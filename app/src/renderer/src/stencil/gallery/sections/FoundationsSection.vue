<script setup lang="ts">
import { scaleRows } from '../gallery-model'

const space = scaleRows(/^--st-space-\d+$/)
const blocks = scaleRows(/^--st-block-\d+$/).filter((r) => (r.px ?? 0) >= 8)
const LAYOUT_STOPS = [25, 50, 100, 200, 250, 500, 750, 1000, 1500, 2000, 2500, 3000]
const layout = scaleRows(/^--st-layout-\d+$/).filter((r) =>
  LAYOUT_STOPS.includes(Number(r.name.replace('--st-layout-', '')))
)
const radii = [
  '--st-space-50',
  '--st-space-75',
  '--st-space-100',
  '--st-space-150',
  '--st-space-200',
  '--st-space-300',
  '--st-radius-pill',
  '--st-radius-circle'
]
const borders = scaleRows(/^--st-border-\d+$/)
const SHADOWS: Array<[string, string]> = [
  ['sm', 'Tooltip'],
  ['md', 'Menu'],
  ['lg', 'Dialog'],
  ['xl', 'Palette']
]
const RINGS = ['subtle', 'base', 'strong', 'contrast']
</script>

<template>
  <section id="foundations">
    <header>
      <span class="g-mono">04.</span>
      <h2>Foundations</h2>
    </header>
    <p class="g-lede">Space, size, shape, depth.</p>

    <div class="g-sub">
      <h3>Spacing</h3>
      <table class="g-table g-compact">
        <tbody>
          <tr v-for="row in space" :key="row.name">
            <td class="g-mono g-nowrap">{{ row.name }}</td>
            <td class="g-mono g-nowrap g-num">{{ row.px }}px</td>
            <td><span class="g-bar" :style="{ width: `var(${row.name})` }" /></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="g-sub">
      <h3>Block</h3>
      <div class="g-blocks">
        <div v-for="row in blocks" :key="row.name">
          <span
            class="g-square"
            :style="{ width: `var(${row.name})`, height: `var(${row.name})` }"
          />
          <span class="g-mono">{{ row.name.replace('--st-block-', '') }}<br />{{ row.px }}px</span>
        </div>
      </div>
    </div>

    <div class="g-sub">
      <h3>Layout</h3>
      <table class="g-table g-compact">
        <tbody>
          <tr v-for="row in layout" :key="row.name">
            <td class="g-mono g-nowrap">{{ row.name }}</td>
            <td class="g-mono g-nowrap g-num">{{ row.px }}px</td>
            <td><span class="g-bar" :style="{ width: `${((row.px ?? 0) / 1920) * 100}%` }" /></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="g-sub">
      <h3>Radius</h3>
      <div class="g-blocks">
        <div v-for="name in radii" :key="name">
          <span class="g-square g-radius" :style="{ borderRadius: `var(${name})` }" />
          <span class="g-mono">{{ name }}</span>
        </div>
      </div>
    </div>

    <div class="g-sub">
      <h3>Border width</h3>
      <div class="g-blocks">
        <div v-for="row in borders" :key="row.name">
          <span class="g-line" :style="{ borderTopWidth: `var(${row.name})` }" />
          <span class="g-mono">{{ row.name }}<br />{{ row.px }}px</span>
        </div>
      </div>
    </div>

    <div class="g-sub">
      <h3>Elevation</h3>
      <div class="g-grid g-grid-wide g-elevation">
        <div v-for="[size, use] in SHADOWS" :key="size" class="g-swatch">
          <div class="g-shadow" :style="{ boxShadow: `var(--st-shadow-${size})` }" />
          <b>{{ size }}</b>
          <span class="g-mono">--st-shadow-{{ size }}</span>
          <span class="g-mono">{{ use }}</span>
        </div>
      </div>
      <div class="g-panels">
        <div data-theme="dark" class="g-panel">
          <div class="g-shadow g-shadow-lg" />
          <span class="g-mono">dark</span>
        </div>
        <div data-theme="light" class="g-panel">
          <div class="g-shadow g-shadow-lg" />
          <span class="g-mono">light</span>
        </div>
      </div>
    </div>

    <div class="g-sub">
      <h3>Ring</h3>
      <div class="g-grid g-grid-wide">
        <div v-for="level in RINGS" :key="level" class="g-swatch">
          <div class="g-ring" :style="{ boxShadow: `var(--st-ring-${level})` }" />
          <b>{{ level }}</b>
          <span class="g-mono">--st-ring-{{ level }}</span>
        </div>
      </div>
      <div class="g-ringdemo">
        <button type="button" class="g-demo g-demo-border">Border</button>
        <button type="button" class="g-demo g-demo-ring">Ring</button>
      </div>
    </div>
  </section>
</template>
