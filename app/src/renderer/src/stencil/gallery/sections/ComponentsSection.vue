<script setup lang="ts">
import { ref } from 'vue'

import StBox from '../../components/StBox.vue'
import StButton from '../../components/StButton.vue'
import StCheckbox from '../../components/StCheckbox.vue'
import StField from '../../components/StField.vue'
import StSegmented from '../../components/StSegmented.vue'
import StSelect from '../../components/StSelect.vue'
import StNotice from '../../components/StNotice.vue'
import StIconButton from '../../components/StIconButton.vue'
import StIcon from '../../icons/StIcon.vue'
import StInput from '../../components/StInput.vue'
import StProse from '../../components/StProse.vue'
import StStack from '../../components/StStack.vue'
import StText from '../../components/StText.vue'
import {
  BOX_EDGES,
  BOX_SHADOWS,
  BOX_SURFACES,
  STACK_ALIGN,
  STACK_JUSTIFY
} from '../../components/layout-props'
import { BUTTON_SIZES, BUTTON_VARIANTS } from '../../components/button-props'
import { NOTICE_TONES } from '../../components/notice-props'
import { TEXT_ROLES, TEXT_TONES, type TextRole } from '../../components/text-props'

const ROLES = Object.keys(TEXT_ROLES) as TextRole[]
const SAMPLE = {
  caption: 'Updated 3 minutes ago',
  body: 'Notes that think with you',
  label: 'Search notes',
  headline: 'Today',
  code: 'welcome.md'
}
const LONG =
  'A workstream is the unit. Ryte keeps the plan, the board, and the notes in one place, so the next session starts where the last one stopped.'
// Tones meant for text on a filled surface are shown on that fill.
const FILLS: Partial<Record<string, string>> = {
  contrast: 'var(--st-color-accent-fill)',
  'on-primary': 'var(--st-color-fill-primary)'
}
// Fixed demo markup, as the markdown renderer would produce it.
const PROSE = `<h1>Synthetic welcome note</h1>
<p>A short paragraph with <strong>bold</strong>, <em>italic</em>, <code>inline code</code>, and a <a href="#">link</a>.</p>
<h2>Second level heading</h2>
<ul><li>First bullet</li><li>Second bullet<ul><li>Nested bullet</li></ul></li></ul>
<ol><li>Ordered one</li><li>Ordered two</li></ol>
<blockquote><p>A block quote with some text.</p></blockquote>
<pre><code>const note = 'plain code block'</code></pre>
<table><thead><tr><th>Token</th><th>Value</th></tr></thead><tbody><tr><td>space-100</td><td>8px</td></tr><tr><td>space-200</td><td>16px</td></tr></tbody></table>
<hr>
<h3>Third level heading</h3>
<p>Another paragraph that wraps across more than one line so the leading and the paragraph spacing are visible.</p>`
const ICON_BUTTONS = ['close', 'copy', 'refresh', 'plus', 'more-vertical', 'sidebar'] as const
const mode = ref('system')
const retention = ref('30')
const keep = ref(true)
const never = ref(false)
const folder = ref('')
const MODES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]
const RETENTION = [
  { value: '30', label: '30 days (default)' },
  { value: '90', label: '90 days' },
  { value: 'off', label: 'Off' }
]
const boxed = ref('Documents/Ryte')
const large = ref('')
const invalid = ref('not-a-folder')
const renaming = ref('welcome.md')
const search = ref('')
const RADII = [50, 100, 150, 200, 300, 'pill'] as const
</script>

<template>
  <section id="components">
    <header>
      <span class="g-mono">06.</span>
      <h2>Components</h2>
    </header>
    <p class="g-lede">Layout primitives. Props take token stops only.</p>

    <div class="g-sub">
      <h3>StStack</h3>
      <div class="g-cells">
        <div class="g-swatch">
          <StBox surface="sunken" :radius="150" :padding="150">
            <StStack :gap="100">
              <StBox
                v-for="n in 3"
                :key="n"
                surface="raised"
                ring="subtle"
                :radius="100"
                :padding="100"
              >
                {{ n }}
              </StBox>
            </StStack>
          </StBox>
          <span class="g-mono">&lt;StStack gap="100"&gt;</span>
        </div>
        <div class="g-swatch">
          <StBox surface="sunken" :radius="150" :padding="150">
            <StStack direction="row" :gap="200" align="center">
              <StBox surface="raised" ring="subtle" :radius="100" :padding="100">A</StBox>
              <StBox surface="raised" ring="subtle" :radius="100" :padding="200">B</StBox>
              <StBox surface="raised" ring="subtle" :radius="100" :padding="100">C</StBox>
            </StStack>
          </StBox>
          <span class="g-mono">&lt;StStack direction="row" gap="200" align="center"&gt;</span>
        </div>
        <div class="g-swatch">
          <StBox surface="sunken" :radius="150" :padding="150">
            <StStack direction="row" justify="between" align="center">
              <span>Left</span>
              <span>Right</span>
            </StStack>
          </StBox>
          <span class="g-mono">&lt;StStack direction="row" justify="between"&gt;</span>
        </div>
        <div class="g-swatch">
          <StBox surface="sunken" :radius="150" :padding="150">
            <StStack direction="row" :gap="75" wrap>
              <StBox
                v-for="n in 14"
                :key="n"
                surface="raised"
                ring="subtle"
                radius="pill"
                :padding-x="150"
                :padding-y="50"
              >
                tag {{ n }}
              </StBox>
            </StStack>
          </StBox>
          <span class="g-mono">&lt;StStack direction="row" gap="75" wrap&gt;</span>
        </div>
      </div>
      <p class="g-mono">
        direction {{ 'column row' }} · gap {{ 'space stops' }} · align {{ STACK_ALIGN.join(' ') }} ·
        justify {{ STACK_JUSTIFY.join(' ') }} · wrap
      </p>
    </div>

    <div class="g-sub">
      <h3>StBox</h3>
      <div class="g-cells">
        <div v-for="surface in BOX_SURFACES" :key="surface" class="g-swatch">
          <StBox :surface="surface" ring="subtle" :radius="150" :padding="250">{{ surface }}</StBox>
          <span class="g-mono">surface="{{ surface }}"</span>
        </div>
        <div v-for="edge in BOX_EDGES" :key="`b${edge}`" class="g-swatch">
          <StBox :border="edge" :radius="150" :padding="250">{{ edge }}</StBox>
          <span class="g-mono">border="{{ edge }}"</span>
        </div>
        <div v-for="radius in RADII" :key="`r${radius}`" class="g-swatch">
          <StBox surface="sunken" ring="base" :radius="radius" :padding="250">{{ radius }}</StBox>
          <span class="g-mono">radius="{{ radius }}"</span>
        </div>
        <div v-for="shadow in BOX_SHADOWS" :key="`s${shadow}`" class="g-swatch">
          <StBox surface="floating" ring="subtle" :radius="150" :padding="250" :shadow="shadow">
            {{ shadow }}
          </StBox>
          <span class="g-mono">shadow="{{ shadow }}"</span>
        </div>
      </div>
      <p class="g-mono">
        surface · border · ring · radius · shadow · padding · padding-x · padding-y (space stops)
      </p>
    </div>

    <div class="g-sub">
      <h3>StText</h3>
      <div class="g-cells">
        <div v-for="role in ROLES" :key="role" class="g-swatch">
          <StStack :gap="75">
            <StText v-for="size in TEXT_ROLES[role]" :key="size" :kind="role" :size="size">
              {{ SAMPLE[role] }}
            </StText>
          </StStack>
          <span class="g-mono">kind="{{ role }}" size="{{ TEXT_ROLES[role].join(' ') }}"</span>
        </div>
        <div v-for="tone in TEXT_TONES" :key="tone" class="g-swatch">
          <StBox
            :surface="FILLS[tone] ? undefined : 'sunken'"
            :style="FILLS[tone] ? { background: FILLS[tone] } : undefined"
            :radius="100"
            :padding="150"
          >
            <StText :tone="tone" kind="label" size="lg">{{ SAMPLE.label }}</StText>
          </StBox>
          <span class="g-mono">tone="{{ tone }}"</span>
        </div>
        <div class="g-swatch">
          <StBox surface="sunken" :radius="100" :padding="150">
            <StText truncate as="div">{{ LONG }}</StText>
          </StBox>
          <span class="g-mono">truncate</span>
        </div>
        <div class="g-swatch">
          <StBox surface="sunken" :radius="100" :padding="150">
            <StText :lines="2" as="p">{{ LONG }}</StText>
          </StBox>
          <span class="g-mono">:lines="2"</span>
        </div>
        <div class="g-swatch">
          <StBox surface="sunken" :radius="100" :padding="150">
            <StText kind="body" weight="medium" align="center" as="p">Weight and align</StText>
          </StBox>
          <span class="g-mono">weight="medium" align="center"</span>
        </div>
      </div>
      <p class="g-mono">
        kind · size · tone · weight · truncate · lines · align · as (default span)
      </p>
    </div>

    <div class="g-sub">
      <h3>StButton</h3>
      <div class="g-cells">
        <div v-for="variant in BUTTON_VARIANTS" :key="variant" class="g-swatch">
          <StStack direction="row" align="center" :gap="150" wrap>
            <StButton v-for="size in BUTTON_SIZES" :key="size" :variant="variant" :size="size">
              Button
            </StButton>
            <StButton :variant="variant" disabled>Disabled</StButton>
          </StStack>
          <span class="g-mono">variant="{{ variant }}" size="{{ BUTTON_SIZES.join(' ') }}"</span>
        </div>
        <div class="g-swatch">
          <StButton variant="primary" loading>Saving</StButton>
          <span class="g-mono">loading</span>
        </div>
      </div>
      <p class="g-mono">variant · size · disabled · loading · type (default button)</p>
    </div>

    <div class="g-sub">
      <h3>StIconButton</h3>
      <div class="g-cells">
        <div
          v-for="variant in ['ghost', 'secondary', 'danger'] as const"
          :key="variant"
          class="g-swatch"
        >
          <StStack direction="row" align="center" :gap="100">
            <StIconButton
              v-for="icon in ICON_BUTTONS"
              :key="icon"
              :icon="icon"
              :label="icon"
              :variant="variant"
            />
          </StStack>
          <span class="g-mono">variant="{{ variant }}"</span>
        </div>
        <div class="g-swatch">
          <StStack direction="row" align="center" :gap="100">
            <StIconButton
              v-for="size in BUTTON_SIZES"
              :key="size"
              icon="close"
              label="Close"
              :size="size"
            />
            <StIconButton icon="close" label="Close" disabled />
          </StStack>
          <span class="g-mono">size="{{ BUTTON_SIZES.join(' ') }}" disabled</span>
        </div>
      </div>
      <p class="g-mono">icon · label (required, the accessible name) · variant · size · disabled</p>
    </div>

    <div class="g-sub">
      <h3>StInput</h3>
      <div class="g-cells">
        <div class="g-swatch">
          <StInput v-model="boxed" label="Location" />
          <span class="g-mono">variant="boxed"</span>
        </div>
        <div class="g-swatch">
          <StInput v-model="large" label="Name" size="lg" placeholder="Large, empty" />
          <span class="g-mono">size="lg" placeholder</span>
        </div>
        <div class="g-swatch">
          <StInput v-model="invalid" label="Folder" invalid />
          <span class="g-mono">invalid</span>
        </div>
        <div class="g-swatch">
          <StInput model-value="Disabled" label="Disabled" disabled />
          <span class="g-mono">disabled</span>
        </div>
        <div class="g-swatch">
          <StBox surface="sunken" :radius="100" :padding="100">
            <StText kind="body" size="compact" as="div">
              <StInput v-model="renaming" label="File name" variant="inline" />
            </StText>
          </StBox>
          <span class="g-mono">variant="inline" (inherits the text around it)</span>
        </div>
        <div class="g-swatch">
          <StBox surface="sunken" :radius="150" :padding="150">
            <StStack direction="row" align="center" :gap="100">
              <StIcon name="search" :size="18" />
              <StInput
                v-model="search"
                label="Search"
                variant="bare"
                size="lg"
                placeholder="Search your notes"
              />
            </StStack>
          </StBox>
          <span class="g-mono">variant="bare" size="lg"</span>
        </div>
      </div>
      <p class="g-mono">
        variant · size · type · invalid · v-model · label (accessible name) · focus() ·
        select(start, end)
      </p>
    </div>

    <div class="g-sub">
      <h3>StField</h3>
      <div class="g-cells">
        <div class="g-swatch">
          <StField label="Location" hint="Where Ryte keeps your notes.">
            <template #default="field">
              <StInput
                :id="field.id"
                v-model="boxed"
                :aria-describedby="field.describedby"
                :invalid="field.invalid"
              />
            </template>
          </StField>
          <span class="g-mono">label · hint</span>
        </div>
        <div class="g-swatch">
          <StField
            label="Folder"
            hint="Pick a folder."
            :error="folder ? undefined : 'Choose a folder.'"
          >
            <template #default="field">
              <StInput
                :id="field.id"
                v-model="folder"
                :aria-describedby="field.describedby"
                :invalid="field.invalid"
              />
            </template>
          </StField>
          <span class="g-mono">error (empty value)</span>
        </div>
      </div>
      <p class="g-mono">label · hint · error · slot { id, describedby, invalid }</p>
    </div>

    <div class="g-sub">
      <h3>StSelect</h3>
      <div class="g-cells">
        <div class="g-swatch">
          <StSelect v-model="retention" :options="RETENTION" label="Retention" />
          <span class="g-mono">v-model · options · label</span>
        </div>
        <div class="g-swatch">
          <StSelect v-model="retention" :options="RETENTION" label="Retention" disabled />
          <span class="g-mono">disabled</span>
        </div>
        <div class="g-swatch">
          <StSelect v-model="retention" :options="RETENTION" label="Retention" invalid />
          <span class="g-mono">invalid</span>
        </div>
      </div>
    </div>

    <div class="g-sub">
      <h3>StCheckbox</h3>
      <div class="g-cells">
        <div class="g-swatch">
          <StCheckbox v-model="keep">Keep generated summaries with my history</StCheckbox>
          <span class="g-mono">v-model</span>
        </div>
        <div class="g-swatch">
          <StCheckbox v-model="never">Unchecked</StCheckbox>
          <span class="g-mono">unchecked</span>
        </div>
        <div class="g-swatch">
          <StCheckbox :model-value="true" disabled>Disabled</StCheckbox>
          <span class="g-mono">disabled</span>
        </div>
      </div>
    </div>

    <div class="g-sub">
      <h3>StSegmented</h3>
      <div class="g-cells">
        <div class="g-swatch">
          <StSegmented v-model="mode" :options="MODES" label="Color mode" />
          <span class="g-mono">radiogroup · arrows, Home, End · {{ mode }}</span>
        </div>
      </div>
    </div>

    <div class="g-sub">
      <h3>StNotice</h3>
      <StStack :gap="150">
        <StNotice v-for="tone in NOTICE_TONES" :key="tone" :tone="tone">
          A {{ tone }} notice explains the state of something.
        </StNotice>
        <StNotice tone="warning" title="Sending to the cloud">
          This search sends excerpts to your provider.
          <template #actions>
            <StButton variant="ghost" size="sm">Cancel</StButton>
            <StButton size="sm">Continue</StButton>
          </template>
        </StNotice>
        <StNotice tone="info" dismissible>Dismissible, with a close button.</StNotice>
        <StNotice tone="danger" variant="inline">Inline: colored text with no box.</StNotice>
      </StStack>
      <p class="g-mono">
        tone · variant · title · dismissible · urgent · actions slot · danger announces as alert,
        the rest as status
      </p>
    </div>

    <div class="g-sub">
      <h3>StProse</h3>
      <StBox border="subtle" :radius="200" :padding="400">
        <StProse :html="PROSE" />
      </StBox>
      <p class="g-mono">
        html · as (default article) · size, leading and measure from --st-reading-*
      </p>
    </div>
  </section>
</template>
