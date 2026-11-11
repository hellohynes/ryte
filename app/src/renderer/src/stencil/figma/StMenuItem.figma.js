// url=<STENCIL_FILE>?node-id=8-205
// source=app/src/renderer/src/stencil/components/StMenuItem.vue
// component=StMenuItem
import figma from 'figma'
const i = figma.selectedInstance
const state = i.getPropertyValue('state')
const tone = i.getPropertyValue('tone') === 'danger' ? ' tone="danger"' : ''
const flags =
  state === 'checked' ? ' role="menuitemcheckbox" checked' : state === 'disabled' ? ' disabled' : ''

export default {
  example: figma.code`<StMenuItem${tone}${flags}>${i.getString('label')}</StMenuItem>`,
  id: 'st-menu-item'
}
