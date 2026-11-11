// Syncs Stencil's tokens into a Figma file; run it with the connector's `use_figma`
// (docs/stencil-figma.md). Paste `pnpm stencil:figma-export -- --stdout --min` over EXPORT.
// Matches collections and variables by name, creates what is missing, sets each mode's value and
// web code syntax, and keeps an alias that already resolves right. Never deletes: variables only in
// Figma are listed as "not in code".
const EXPORT = { collections: [] } // paste here
const ONLY = null // a collection name, or null for all
const DRY_RUN = false // true reports what would change without writing

const rgba = (hex) => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255,
  a: hex.length > 7 ? parseInt(hex.slice(7, 9), 16) / 255 : 1
})
const byte = (n) =>
  Math.round(n * 255)
    .toString(16)
    .padStart(2, '0')
const toHex = (c) => `#${byte(c.r)}${byte(c.g)}${byte(c.b)}${c.a < 1 ? byte(c.a) : ''}`

// Follows an alias to its value in the target's mode of the same name (its default mode otherwise).
async function resolved(value, modeName) {
  while (value && value.type === 'VARIABLE_ALIAS') {
    const target = await figma.variables.getVariableByIdAsync(value.id)
    const owner = await figma.variables.getVariableCollectionByIdAsync(target.variableCollectionId)
    const mode = owner.modes.find((m) => m.name === modeName)
    value = target.valuesByMode[mode ? mode.modeId : owner.defaultModeId]
  }
  return value
}
// Colors match within one step per channel: palette math rounds differently in code and in Figma.
const channels = (hex) => [1, 3, 5, 7].map((i) => parseInt(hex.slice(i, i + 2) || 'ff', 16))
const near = (a, b) => channels(a).every((n, i) => Math.abs(n - channels(b)[i]) <= 1)
const same = (current, wanted) =>
  typeof wanted === 'string' && wanted[0] === '#'
    ? current && typeof current === 'object' && near(toHex(current), wanted)
    : current === wanted

const all = await figma.variables.getLocalVariablesAsync()
const collections = await figma.variables.getLocalVariableCollectionsAsync()
const report = []
for (const wanted of EXPORT.collections.filter((c) => !ONLY || c.name === ONLY)) {
  let collection = collections.find((c) => c.name === wanted.name)
  const row = {
    collection: wanted.name,
    created: [],
    updated: [],
    aliasReplaced: [],
    unchanged: 0,
    notInCode: []
  }
  if (!collection && !DRY_RUN) {
    collection = figma.variables.createVariableCollection(wanted.name)
    collection.renameMode(collection.modes[0].modeId, wanted.modes[0])
  }
  for (const mode of wanted.modes)
    if (collection && !collection.modes.some((m) => m.name === mode) && !DRY_RUN)
      collection.addMode(mode)
  const existing = collection ? all.filter((v) => v.variableCollectionId === collection.id) : []
  for (const item of wanted.variables) {
    let variable = existing.find((v) => v.name === item.name)
    const changes = []
    const replaced = []
    if (!variable) {
      row.created.push(item.name)
      if (DRY_RUN) continue
      variable = figma.variables.createVariable(item.name, collection, item.type)
      variable.scopes = item.scopes
    }
    for (const mode of collection.modes) {
      if (!(mode.name in item.values)) continue
      const raw = variable.valuesByMode[mode.modeId]
      if (same(await resolved(raw, mode.name), item.values[mode.name])) continue
      if (raw && raw.type === 'VARIABLE_ALIAS') replaced.push(mode.name)
      else changes.push(mode.name)
      const value = item.type === 'COLOR' ? rgba(item.values[mode.name]) : item.values[mode.name]
      if (!DRY_RUN) variable.setValueForMode(mode.modeId, value)
    }
    if (variable.codeSyntax.WEB !== item.codeSyntax) {
      changes.push('code syntax')
      if (!DRY_RUN) variable.setVariableCodeSyntax('WEB', item.codeSyntax)
    }
    if (replaced.length) row.aliasReplaced.push(`${item.name} (${replaced})`)
    if (changes.length && !row.created.includes(item.name))
      row.updated.push(`${item.name} (${changes})`)
    else if (!changes.length && !replaced.length) row.unchanged++
  }
  const names = new Set(wanted.variables.map((v) => v.name))
  row.notInCode = existing.filter((v) => !names.has(v.name)).map((v) => v.name)
  report.push(row)
}
const cap = (list) =>
  list.length > 25 ? [...list.slice(0, 25), `... ${list.length} in all`] : list
return report.map((r) => {
  const counts = { unchanged: r.unchanged }
  for (const key of ['created', 'updated', 'aliasReplaced', 'notInCode'])
    counts[key] = r[key].length
  return {
    collection: r.collection,
    counts,
    created: cap(r.created),
    updated: cap(r.updated),
    aliasReplaced: cap(r.aliasReplaced),
    notInCode: cap(r.notInCode)
  }
})
