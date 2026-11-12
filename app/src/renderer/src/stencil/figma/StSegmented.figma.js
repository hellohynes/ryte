// url=<STENCIL_FILE>?node-id=39-21
// source=app/src/renderer/src/stencil/components/StSegmented.vue
// component=StSegmented
import figma from 'figma'

// Plain JS run by the Code Connect CLI: there are no types to return.
/* eslint-disable @typescript-eslint/explicit-function-return-type */

// The Segment items in the Options slot become `options`; the selected one is the model value.
const i = figma.selectedInstance
const items = i.getSlot('Options')?.connectedInstances ?? []
const slug = (item) => item.getString('label').toLowerCase().replace(/\s+/g, '-')
const iconOf = (item) => item.getBoolean('icon') && item.getInstanceSwap('glyph')
const options = items.map(
  (item) =>
    `{ value: '${slug(item)}', label: '${item.getString('label')}'${iconOf(item) ? `, icon: '${iconOf(item).name.replace('Icon/', '')}'` : ''} }`
)
const current = items.find((item) => item.getPropertyValue('selected') === 'true')
const size = i.getPropertyValue('size') === 'sm' ? ' size="sm"' : ''

export default {
  example: figma.code`<StSegmented :options="[${options.join(', ')}]" model-value="${current ? slug(current) : ''}"${size} label="Label" />`,
  id: 'st-segmented'
}
