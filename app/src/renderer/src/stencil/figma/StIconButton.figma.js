// url=<STENCIL_FILE>?node-id=7-141
// source=app/src/renderer/src/stencil/components/StIconButton.vue
// component=StIconButton
import figma from 'figma'
const i = figma.selectedInstance
const [variant, size] = [i.getPropertyValue('variant'), i.getPropertyValue('size')]
const disabled = i.getPropertyValue('state') === 'disabled' ? ' disabled' : ''

// The icon is a name in code; replace icon-name and label.
export default {
  example: figma.code`<StIconButton variant="${variant}" size="${size}" icon="icon-name" label="Label"${disabled} />`,
  id: 'st-icon-button'
}
