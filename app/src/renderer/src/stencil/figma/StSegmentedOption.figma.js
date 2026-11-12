// url=<STENCIL_FILE>?node-id=38-58
// source=app/src/renderer/src/stencil/components/StSegmented.vue
// component=StSegmentedOption
import figma from 'figma'

// One entry of StSegmented's `options`. The value is the label, lower-case, dashes for spaces.
const i = figma.selectedInstance
const label = i.getString('label')
const value = label.toLowerCase().replace(/\s+/g, '-')
const glyph = i.getInstanceSwap('glyph')
const icon = i.getBoolean('icon') && glyph ? `, icon: '${glyph.name.replace('Icon/', '')}'` : ''

export default {
  example: figma.code`{ value: '${value}', label: '${label}'${icon} }`,
  id: 'st-segmented-option'
}
