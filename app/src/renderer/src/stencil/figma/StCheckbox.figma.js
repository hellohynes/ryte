// url=<STENCIL_FILE>?node-id=8-89
// source=app/src/renderer/src/stencil/components/StCheckbox.vue
// component=StCheckbox
import figma from 'figma'
const i = figma.selectedInstance
const checked = i.getPropertyValue('checked')
const disabled = i.getPropertyValue('state') === 'disabled' ? ' disabled' : ''

export default {
  example: figma.code`<StCheckbox :model-value="${checked}"${disabled}>${i.getString('label')}</StCheckbox>`,
  id: 'st-checkbox'
}
