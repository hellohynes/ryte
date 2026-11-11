// url=<STENCIL_FILE>?node-id=8-114
// source=app/src/renderer/src/stencil/components/StSegmented.vue
// component=StSegmented
import figma from 'figma'

// `selected` in Figma is the model value, so the snippet has no props to map.
export default {
  example: figma.code`<StSegmented v-model="mode" :options="options" label="Label" />`,
  id: 'st-segmented'
}
