<script setup lang="ts">
import { PALETTES, type Family } from '../../tokens/colors'
import { SEMANTIC_GROUPS, paletteSwatches, semanticSwatch, textContrast } from '../gallery-model'
import Swatch from './Swatch.vue'

const FAMILIES = Object.keys(PALETTES) as Family[]
const group = (title: string): ReturnType<typeof semanticSwatch>[] =>
  SEMANTIC_GROUPS.find((g) => g.title === title)!.names.map(semanticSwatch)
const mapping = (s: { dark: string; light: string }): string => `${s.dark} → ${s.light}`
const contrasts = textContrast()
const ratio = (n: number): string => n.toFixed(1)
const TEXT_SAMPLE = 'The quick brown fox'
</script>

<template>
  <section id="color">
    <header>
      <span class="g-mono">02.</span>
      <h2>Color</h2>
    </header>
    <p class="g-lede">Ten-step palettes. Components use semantic tokens; each theme remaps them.</p>

    <div class="g-sub">
      <h3>Palettes</h3>
      <div v-for="family in FAMILIES" :key="family" class="g-family">
        <h4>
          {{ family[0]!.toUpperCase() + family.slice(1) }}
          <span class="g-mono">base {{ PALETTES[family].base }}</span>
        </h4>
        <div class="g-grid">
          <Swatch
            v-for="s in paletteSwatches(family)"
            :key="s.token"
            :name="s.name"
            :fill="`var(${s.token})`"
            :base="s.base"
            :lines="[s.token, s.hex, s.oklch]"
          />
        </div>
      </div>
    </div>

    <div class="g-sub">
      <h3>Surface</h3>
      <div class="g-grid g-grid-wide">
        <Swatch
          v-for="s in group('Surface')"
          :key="s.token"
          :name="s.name.replace('surface-', '')"
          :fill="`var(${s.token})`"
          :lines="[s.token, mapping(s)]"
        />
      </div>
      <div class="g-nest g-nest-base">
        <span class="g-mono">base</span>
        <div class="g-nest g-nest-sunken">
          <span class="g-mono">sunken</span>
          <div class="g-nest g-nest-sunken"><span class="g-mono">sunken</span></div>
          <div class="g-nest g-nest-raised">
            <span class="g-mono">raised</span>
            <div class="g-nest g-nest-raised"><span class="g-mono">raised</span></div>
          </div>
        </div>
        <div class="g-nest g-nest-raised">
          <span class="g-mono">raised</span>
          <div class="g-nest g-nest-sunken"><span class="g-mono">sunken</span></div>
        </div>
      </div>
    </div>

    <div class="g-sub">
      <h3>State</h3>
      <div class="g-grid g-grid-wide">
        <Swatch
          v-for="s in group('State')"
          :key="s.token"
          :name="s.name.replace('surface-', '')"
          :fill="`var(${s.token})`"
          :lines="[s.token, mapping(s)]"
        />
      </div>
    </div>

    <div class="g-sub">
      <h3>Text</h3>
      <table class="g-table">
        <thead>
          <tr>
            <th>Tone</th>
            <th>Sample</th>
            <th>Dark → light</th>
            <th>Contrast</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in contrasts" :key="row.token">
            <td>
              <b>{{ row.tone }}</b
              ><br /><span class="g-mono">{{ row.token }}</span>
            </td>
            <td class="g-sample" :style="{ color: `var(${row.token})` }">{{ TEXT_SAMPLE }}</td>
            <td class="g-mono">
              {{ mapping(semanticSwatch(row.token.replace('--st-color-', ''))) }}
            </td>
            <td class="g-mono">{{ ratio(row.dark) }} · {{ ratio(row.light) }}</td>
          </tr>
          <tr>
            <td><b>contrast</b><br /><span class="g-mono">--st-color-text-contrast</span></td>
            <td>
              <span class="g-on-accent">On accent fill</span>
            </td>
            <td class="g-mono">black-50 → black-50</td>
            <td class="g-mono">on accent-fill</td>
          </tr>
          <tr>
            <td><b>on primary</b><br /><span class="g-mono">--st-color-text-on-primary</span></td>
            <td>
              <span class="g-on-primary">On primary fill</span>
            </td>
            <td class="g-mono">black-950 → black-50</td>
            <td class="g-mono">on fill-primary</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="g-sub">
      <h3>Border</h3>
      <div class="g-grid g-grid-wide">
        <Swatch
          v-for="s in group('Border')"
          :key="s.token"
          ring
          :name="s.name.replace('border-', '')"
          :fill="`var(${s.token})`"
          :lines="[s.token, mapping(s)]"
        />
      </div>
    </div>

    <div class="g-sub">
      <h3>Action</h3>
      <div class="g-grid g-grid-wide">
        <Swatch
          v-for="s in group('Action')"
          :key="s.token"
          :name="s.name"
          :fill="`var(${s.token})`"
          :lines="[s.token, mapping(s)]"
        />
      </div>
    </div>

    <div class="g-sub">
      <h3>Status</h3>
      <div class="g-grid g-grid-wide">
        <Swatch
          v-for="s in group('Status')"
          :key="s.token"
          :name="s.name"
          :fill="`var(${s.token})`"
          :lines="[s.token, mapping(s)]"
        />
      </div>
    </div>
  </section>
</template>
