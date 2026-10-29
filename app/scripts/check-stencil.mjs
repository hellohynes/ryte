// Conformance checks for the renderer's use of Stencil. A skill can be ignored; a failing check can't.
// Usage: pnpm check:stencil
//
// Outside stencil/ it flags hard-coded colors, raw px sizes, and raw top-layer APIs (a dialog or
// popover built by hand). Inside it, it flags a component with no gallery entry, and a component with
// keyboard or top-layer behavior that no keyboard contract scenario covers.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const renderer = resolve(app, 'src/renderer/src')
const stencil = resolve(renderer, 'stencil')
const failures = []

function files(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

const rel = (path) => relative(app, path)
const fail = (path, line, message) => failures.push(`${rel(path)}:${line}: ${message}`)

// Third-party themes and generated font data are not Ryte's styling.
const SKIPPED = [/\/stencil\//, /\/fonts\//, /\.test\.ts$/, /\.generated\./]
const appFiles = files(renderer).filter(
  (path) => /\.(vue|css|ts)$/.test(path) && !SKIPPED.some((skip) => skip.test(path))
)

/** The lines of a file that are styles, with comments blanked: a .css file, or a Vue style block. */
function styleLines(path, text) {
  if (!path.endsWith('.vue') && !path.endsWith('.css')) return []
  const out = []
  let inStyle = path.endsWith('.css')
  let inComment = false
  text.split('\n').forEach((raw, index) => {
    if (raw.trim().startsWith('<style')) inStyle = true
    else if (raw.trim() === '</style>') inStyle = false
    let line = raw
    if (inComment) {
      const end = line.indexOf('*/')
      if (end === -1) return
      line = line.slice(end + 2)
      inComment = false
    }
    line = line.replace(/\/\*.*?\*\//g, '')
    if (line.includes('/*')) {
      line = line.slice(0, line.indexOf('/*'))
      inComment = true
    }
    if (inStyle) out.push({ line, number: index + 1 })
  })
  return out
}

for (const path of appFiles) {
  const text = readFileSync(path, 'utf8')
  for (const { line, number } of styleLines(path, text)) {
    if (/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/.test(line)) {
      fail(path, number, 'a hard-coded color. Use a --st-color-* token.')
    }
    if (/(?<![\w.-])(?!0px)\d*\.?\d+px\b/.test(line) && !/^\s*@(media|container)\b/.test(line)) {
      fail(path, number, 'a raw px size. Use a --st-space-*, --st-block-*, or --st-layout-* token.')
    }
  }
  if (path.endsWith('.vue')) {
    text.split('\n').forEach((line, index) => {
      if (/<dialog\b|\spopover(?:=|\s|>)|\.showModal\(|\.showPopover\(/.test(line)) {
        fail(
          path,
          index + 1,
          'a raw dialog or popover. Use StDialog, StPopover, StMenu, or StTooltip.'
        )
      }
    })
  }
}

// Every Stencil component is shown in the gallery.
const gallery = files(resolve(stencil, 'gallery/sections'))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n')
const components = [
  ...files(resolve(stencil, 'components')).filter((path) => /\/St\w+\.vue$/.test(path)),
  resolve(stencil, 'icons/StIcon.vue')
]
const { scenarios } = await import(
  pathToFileURL(resolve(app, 'scripts/stencil-test/scenarios.mjs')).href
)
const covered = new Set(scenarios.flatMap((scenario) => scenario.covers ?? []))
const BEHAVIOR =
  /@keydown|\bpopover=|<dialog\b|<details\b|useDismissLayer|useRovingFocus|role="radio"|type="checkbox"/

for (const path of components) {
  const name = path.match(/(\w+)\.vue$/)[1]
  const source = readFileSync(path, 'utf8')
  if (!new RegExp(`<${name}\\b`).test(gallery) && !(name === 'StIcon' && /StIcon/.test(gallery))) {
    fail(path, 1, `${name} has no gallery entry. Add it to a section in stencil/gallery/sections/.`)
  }
  if (BEHAVIOR.test(source) && !covered.has(name)) {
    fail(
      path,
      1,
      `${name} has keyboard or top-layer behavior but no scenario lists it in \`covers\` (scripts/stencil-test/scenarios.mjs).`
    )
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  console.error(
    `\n${failures.length} Stencil conformance problem${failures.length === 1 ? '' : 's'}.`
  )
  process.exit(1)
}
console.log('Stencil conformance checks pass.')
