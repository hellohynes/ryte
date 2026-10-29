// Assembles the GitHub Pages artifact in site-dist/: the landing page (site/) plus the Stencil
// gallery at /stencil/. Usage: node scripts/build-site.mjs   (or `pnpm site:build`)
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'site-dist')
const gallery = resolve(root, 'app/out/stencil')

rmSync(dist, { recursive: true, force: true })
cpSync(resolve(root, 'site'), dist, { recursive: true })

const build = spawnSync('pnpm', ['--dir', 'app', 'stencil:build'], { cwd: root, stdio: 'inherit' })
if (build.status !== 0) {
  console.error('The Stencil gallery build failed.')
  process.exit(build.status ?? 1)
}
if (!existsSync(resolve(gallery, 'index.html'))) {
  console.error('The Stencil gallery build produced no index.html.')
  process.exit(1)
}
cpSync(gallery, resolve(dist, 'stencil'), { recursive: true })
console.log('Site assembled in site-dist/ (landing page and /stencil/).')
