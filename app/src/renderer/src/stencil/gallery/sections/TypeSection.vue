<script setup lang="ts">
import { computed, ref } from 'vue'

import { scaleRows } from '../gallery-model'

const sizes = scaleRows(/^--st-font-size-\d+$/)
const leadings = scaleRows(/^--st-line-height-\d+$/)
const weights = scaleRows(/^--st-font-weight-/)
const roles = scaleRows(/^--st-type-[a-z]+-[a-z]+-size$/).map((row) => ({
  token: row.name.replace(/-size$/, ''),
  name: row.name.replace(/^--st-type-/, '').replace(/-size$/, ''),
  px: row.px
}))
const ROLE_SAMPLES: Record<string, string> = {
  caption: 'Updated 3 minutes ago',
  body: 'Notes that think with you',
  label: 'Search notes',
  headline: 'Today',
  code: 'welcome.md'
}
const SAMPLE = 'Notes that think with you'
const PARAGRAPH =
  'A workstream is the unit. Ryte keeps the plan, the board, and the notes in one place, so the next session starts where the last one stopped.'

const size = ref(1.6)
const leading = ref(1.6)
const measure = ref(100)
const reading = computed(() => ({
  '--st-reading-size': `${size.value}rem`,
  '--st-reading-leading': String(leading.value),
  '--st-reading-measure': measure.value >= 100 ? '100%' : `${measure.value}ch`
}))
</script>

<template>
  <section id="type">
    <header>
      <span class="g-mono">03.</span>
      <h2>Typography</h2>
    </header>
    <p class="g-lede">Geist on a 10px root.</p>

    <div class="g-sub">
      <h3>Family</h3>
      <div class="g-families">
        <div class="g-specimen" style="font-family: var(--st-font-ui)">
          <b>Geist</b>
          <span>ABCDEFGHIJKLMNOPQRSTUVWXYZ</span>
          <span>abcdefghijklmnopqrstuvwxyz</span>
          <span>1234567890 !@#$%^&amp;*()</span>
        </div>
        <div class="g-specimen" style="font-family: var(--st-font-ui-mono)">
          <b>Geist Mono</b>
          <span>ABCDEFGHIJKLMNOPQRSTUVWXYZ</span>
          <span>abcdefghijklmnopqrstuvwxyz</span>
          <span>1234567890 !@#$%^&amp;*()</span>
        </div>
      </div>
    </div>

    <div class="g-sub">
      <h3>Roles</h3>
      <table class="g-table">
        <tbody>
          <tr v-for="role in roles" :key="role.token">
            <td class="g-mono g-nowrap">{{ role.token }}</td>
            <td class="g-mono g-nowrap">{{ role.px }}px</td>
            <td :style="{ font: `var(${role.token})` }">
              {{ ROLE_SAMPLES[role.name.split('-')[0]!] }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="g-sub">
      <h3>Font size</h3>
      <table class="g-table">
        <tbody>
          <tr v-for="row in sizes" :key="row.name">
            <td class="g-mono g-nowrap">{{ row.name }}</td>
            <td class="g-mono g-nowrap">{{ row.px }}px</td>
            <td :style="{ fontSize: `var(${row.name})`, lineHeight: 1.2 }">{{ SAMPLE }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="g-sub">
      <h3>Line height</h3>
      <div class="g-leadings">
        <div v-for="row in leadings" :key="row.name" class="g-leading">
          <span class="g-mono">{{ row.name }} · {{ row.css }}</span>
          <p :style="{ lineHeight: `var(${row.name})` }">{{ PARAGRAPH }}</p>
        </div>
      </div>
    </div>

    <div class="g-sub">
      <h3>Weight</h3>
      <div class="g-grid g-grid-wide">
        <div v-for="row in weights" :key="row.name" class="g-swatch">
          <div class="g-weight" :style="{ fontWeight: `var(${row.name})` }">Aa</div>
          <b>{{ row.name.replace('--st-font-weight-', '') }}</b>
          <span class="g-mono">{{ row.name }} · {{ row.css }}</span>
        </div>
      </div>
    </div>

    <div class="g-sub">
      <h3>Reading</h3>
      <div class="g-reader" :style="reading">
        <div class="g-controls">
          <label
            >Size<input v-model.number="size" type="range" min="1.2" max="2.4" step="0.1" /><output
              class="g-mono"
              >{{ Math.round(size * 10) }}px</output
            ></label
          >
          <label
            >Leading<input
              v-model.number="leading"
              type="range"
              min="1.2"
              max="2"
              step="0.2"
            /><output class="g-mono">{{ leading }}</output></label
          >
          <label
            >Measure<input
              v-model.number="measure"
              type="range"
              min="30"
              max="100"
              step="5"
            /><output class="g-mono">{{ measure >= 100 ? 'none' : `${measure}ch` }}</output></label
          >
        </div>
        <div class="g-reading">
          <p>{{ PARAGRAPH }}</p>
          <p>{{ PARAGRAPH }}</p>
        </div>
        <span class="g-mono">--st-reading-size · --st-reading-leading · --st-reading-measure</span>
      </div>
    </div>
  </section>
</template>
