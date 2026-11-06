// Assembles the GitHub Pages artifact in site-dist/: the landing page (site/) plus the Stencil
// gallery at /stencil/. Usage: node scripts/build-site.mjs   (or `pnpm site:build`)
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fillRelease, siteVersion } from './site-release.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'site-dist')
const gallery = resolve(root, 'app/out/stencil')

// Fail before touching site-dist/ if the latest release cannot be resolved.
let version
try {
  version = await siteVersion()
} catch (error) {
  console.error(error.message)
  process.exit(1)
}

rmSync(dist, { recursive: true, force: true })
cpSync(resolve(root, 'site'), dist, { recursive: true })

// Version text and download links come from the latest published release.
for (const page of readdirSync(dist).filter((name) => name.endsWith('.html'))) {
  const file = resolve(dist, page)
  writeFileSync(file, fillRelease(readFileSync(file, 'utf8'), version))
}
const releasesPage = readFileSync(resolve(dist, 'releases.html'), 'utf8')
if (!releasesPage.includes(`id="v${version.replaceAll('.', '-')}"`)) {
  console.warn(`Warning: releases.html has no entry for v${version}. Add the release entry (docs/site-design.md).`)
}

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
console.log(`Site assembled in site-dist/ for v${version} (landing page and /stencil/).`)
