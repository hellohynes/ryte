// url=<STENCIL_FILE>?node-id=8-44
// source=app/src/renderer/src/stencil/components/StInput.vue
// component=StInput
import figma from 'figma'
const i = figma.selectedInstance
const [variant, size, state] = ['variant', 'size', 'state'].map((name) => i.getPropertyValue(name))
const flags = ['invalid', 'disabled'].includes(state) ? ` ${state}` : ''

export default {
  example: figma.code`<StInput v-model="value" label="Label" variant="${variant}" size="${size}"${flags} />`,
  id: 'st-input'
}
