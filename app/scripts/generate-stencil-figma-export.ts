// Writes the Stencil tokens and the six Figma-mapped components' props as one JSON file, resolved
// to hex and px, for syncing a Figma library (docs/stencil-figma.md).
// Usage: pnpm stencil:figma-export                 write app/.stencil-figma/export.json (gitignored)
//        pnpm stencil:figma-export -- --out FILE   write FILE
//        pnpm stencil:figma-export -- --stdout     print it (--min: one line, to paste into the sync script)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildFigmaExport } from '../src/renderer/src/stencil/tokens/figma-export'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(
  readFileSync(resolve(appDir, 'src/renderer/src/stencil/manifest.json'), 'utf8')
)
const json = `${JSON.stringify(buildFigmaExport(manifest), null, process.argv.includes('--min') ? undefined : 2)}\n`

const args = process.argv.slice(2)
if (args.includes('--stdout')) {
  process.stdout.write(json)
} else {
  const out = resolve(
    args.includes('--out') ? args[args.indexOf('--out') + 1] : '.stencil-figma/export.json'
  )
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, json)
  console.log(`Wrote ${out}`)
}
