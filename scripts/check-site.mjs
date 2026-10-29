// Checks the landing page against the site design rules (docs/site-design.md). Usage: pnpm check:site
//
// CSS: no raw colors or px sizes outside :root, only Stencil's semantic colors, every
// token and asset it references exists; no hidden content without the `js` class; reduced motion
// handled. HTML: one h1, no skipped heading levels, language, image sizes and alt text, working anchors,
// icon sprite ids, no third-party requests. Weight: the page stays small.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const site = resolve(dirname(fileURLToPath(import.meta.url)), '../site')
const failures = []
const fail = (file, message) => failures.push(`site/${file}: ${message}`)
const read = (file) => readFileSync(resolve(site, file), 'utf8')

// ---- CSS ----
const css = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))

/** Declarations with their enclosing selector, from a flat walk of the braces. */
function declarations(source) {
  const out = []
  const stack = []
  let buffer = ''
  let line = 1
  for (const char of source) {
    if (char === '{') {
      stack.push(buffer.trim())
      buffer = ''
    } else if (char === '}') {
      if (buffer.trim()) out.push({ selector: stack.at(-1), text: buffer.trim(), line })
      stack.pop()
      buffer = ''
    } else if (char === ';') {
      if (buffer.trim()) out.push({ selector: stack.at(-1), text: buffer.trim(), line })
      buffer = ''
    } else {
      buffer += char
    }
    if (char === '\n') line++
  }
  return out
}

const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/
const RAW_PX = /(?<![\w.-])(?!0px)\d*\.?\d+px\b/
for (const { selector, text, line } of declarations(css)) {
  // Tokens are defined in :root.
  const inRoot = selector === ':root'
  if (!text.includes(':') || /^@/.test(text)) continue
  if (!inRoot && RAW_COLOR.test(text)) {
    fail('styles.css', `line ${line}: a raw color in \`${selector}\`. Define a --site-* token in :root.`)
  }
  if (!inRoot && RAW_PX.test(text)) {
    fail('styles.css', `line ${line}: a raw px size in \`${selector}\`. Use a --st-space-*, --st-block-*, or --st-layout-* token.`)
  }
}

for (const match of css.matchAll(/(^|\})\s*(\.reveal[^{]*)\{([^}]*opacity:\s*0[^}]*)\}/g)) {
  fail('styles.css', `\`${match[2].trim()}\` hides content without the \`.js\` class, so it would stay hidden without JavaScript.`)
}
if (!/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.js \.reveal/.test(css)) {
  fail('styles.css', 'reduced motion must show .reveal content without a transition.')
}

// ---- Colors: Stencil semantic tokens only ----
// Stencil's own tests (app/src/renderer/src/stencil/tokens/colors.test.ts) prove contrast for every text
// tone on every surface, text on the primary fill, links, and the accent and focus colors, in both themes.
// The site may therefore use those tokens freely, and only those.
const ALLOWED_COLORS =
  /^(text-(strong|primary|secondary|tertiary|muted|contrast|on-primary)|surface-(base|sunken|raised|floating|hover|active|selected)|border-(subtle|base|strong|contrast)|accent|link|link-strong|focus|fill-primary|shadow)$/
for (const match of css.matchAll(/var\(--st-color-([a-z-]+)/g)) {
  if (!ALLOWED_COLORS.test(match[1])) {
    fail('styles.css', `--st-color-${match[1]} is not one of the semantic colors the site may use (see docs/site-design.md).`)
  }
}
if (/--site-(bg|text|signal|line)\b/.test(css)) {
  fail('styles.css', 'site-only color tokens are gone; use the --st-color-* semantic tokens.')
}
const generated = readFileSync(resolve(site, 'stencil-tokens.css'), 'utf8')
// The fonts are the site's own (Stencil's app theme sets them), so styles.css defines them itself.
const own = new Set([...css.matchAll(/(--st-[a-z0-9-]+):/g)].map((m) => m[1]))
for (const match of css.matchAll(/var\((--st-[a-z0-9-]+)/g)) {
  if (!generated.includes(`${match[1]}:`) && !own.has(match[1])) {
    fail('styles.css', `${match[1]} is not defined by stencil-tokens.css.`)
  }
}
for (const match of css.matchAll(/url\("([^"]+)"\)/g)) {
  if (!/^(data:|#)/.test(match[1]) && !existsSync(resolve(site, match[1]))) fail('styles.css', `${match[1]} does not exist.`)
}

// ---- HTML: every page ----
for (const page of ['index.html', 'roadmap.html', 'releases.html']) {
  const html = read(page)
  if (!/<html[^>]*\blang="[a-z-]+"/.test(html)) fail(page, '<html> needs a lang.')
  for (const needle of ['name="viewport"', 'name="description"', 'name="theme-color"', '<title>']) {
    if (!html.includes(needle)) fail(page, `missing ${needle}.`)
  }
  const headings = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]))
  if (headings.filter((level) => level === 1).length !== 1) fail(page, 'there must be exactly one h1.')
  headings.forEach((level, index) => {
    if (index > 0 && level > headings[index - 1] + 1) {
      fail(page, `a heading jumps from h${headings[index - 1]} to h${level}.`)
    }
  })
  for (const match of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = match[0]
    if (!/\balt=/.test(tag)) fail(page, `an image has no alt: ${tag.slice(0, 60)}`)
    if (!/\bwidth=/.test(tag) || !/\bheight=/.test(tag)) fail(page, `an image has no width and height, which causes layout shift: ${tag.slice(0, 60)}`)
  }
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))
  for (const match of html.matchAll(/href="#([^"]+)"/g)) {
    if (!ids.has(match[1])) fail(page, `the link #${match[1]} has no target.`)
  }
  const sprite = read('stencil-icons.svg')
  for (const match of html.matchAll(/href="stencil-icons\.svg#([^"]+)"/g)) {
    if (!sprite.includes(`id="${match[1]}"`)) fail(page, `the icon ${match[1]} is not in stencil-icons.svg (add it to SITE_ICONS in generate-stencil-icons.ts).`)
  }
  // Assets fetched on load must be local; links the reader follows may go anywhere.
  for (const tag of html.matchAll(/<(?:script|img|link)\b[^>]*>/g)) {
    const url = tag[0].match(/\b(?:src|href)="(https?:[^"]+)"/)
    if (url) fail(page, `a third-party request on load: ${url[1]}`)
  }
  // stencil/ is produced by `pnpm site:build`, not kept in site/.
  const BUILT = new Set(['stencil/'])
  for (const match of html.matchAll(/\b(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
    const target = match[1]
    if (/^(https?:|mailto:|data:)/.test(target) || BUILT.has(target)) continue
    if (!existsSync(resolve(site, target))) fail(page, `${target} does not exist.`)
  }
}

// ---- Weight ----
const code = ['index.html', 'roadmap.html', 'releases.html', 'styles.css', 'main.js', 'stencil-tokens.css', 'stencil-icons.svg']
const gzipped = code.reduce((sum, file) => sum + gzipSync(readFileSync(resolve(site, file))).length, 0)
const BUDGET_CODE = 60 * 1024
if (gzipped > BUDGET_CODE) fail('', `HTML, CSS, and JS are ${(gzipped / 1024).toFixed(1)} KB gzipped; the budget is 60 KB.`)
let hero = 0
for (const theme of ['dark', 'light']) {
  const file = `assets/ryte-app-${theme}.webp`
  const size = statSync(resolve(site, file)).size
  hero = Math.max(hero, size)
  if (size > 200 * 1024) fail(file, `${(size / 1024).toFixed(0)} KB; the budget is 200 KB.`)
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  console.error(`\n${failures.length} site problem${failures.length === 1 ? '' : 's'}.`)
  process.exit(1)
}
console.log(`Site checks pass (${(gzipped / 1024).toFixed(1)} KB gzipped code, hero ${(hero / 1024).toFixed(0)} KB).`)
