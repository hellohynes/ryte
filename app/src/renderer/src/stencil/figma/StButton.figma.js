// url=<STENCIL_FILE>?node-id=7-65
// source=app/src/renderer/src/stencil/components/StButton.vue
// component=StButton
import figma from 'figma'
const i = figma.selectedInstance
const [variant, size] = [i.getPropertyValue('variant'), i.getPropertyValue('size')]
const disabled = i.getPropertyValue('state') === 'disabled' ? ' disabled' : ''

export default {
  example: figma.code`<StButton variant="${variant}" size="${size}"${disabled}>${i.getString('label')}</StButton>`,
  id: 'st-button'
}
