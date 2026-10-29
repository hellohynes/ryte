// On macOS, runs a command with a copy of the Electron bundle that looks like the built app: the Ryte
// name and icon, so notifications and the Dock match an installed build. The stock bundle stays untouched.
// Usage: node scripts/dev-electron.mjs <command> [args...]
// Other platforms, and any failure to prepare the copy, run the command with stock Electron.
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const BUNDLE_ID = 'com.joshuahynes.ryte.dev'
const NAME = 'Ryte'

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')}: ${result.stderr || result.error}`)
}

/** Returns the dist directory holding the patched Electron.app, building it when the stamp is stale. */
export function prepareDevElectron() {
  if (process.platform !== 'darwin') return null
  const electronRoot = dirname(require.resolve('electron/package.json'))
  const source = join(electronRoot, 'dist')
  const icon = join(appRoot, 'build/icon.icns')
  if (!existsSync(join(source, 'Electron.app')) || !existsSync(icon)) return null

  const version = JSON.parse(readFileSync(join(electronRoot, 'package.json'), 'utf8')).version
  const stamp = JSON.stringify({
    electron: version,
    icon: createHash('sha1').update(readFileSync(icon)).digest('hex'),
    bundleId: BUNDLE_ID,
    name: NAME
  })
  const root = join(appRoot, '.dev-electron')
  const dist = join(root, 'dist')
  const stampPath = join(root, 'stamp.json')
  if (
    existsSync(join(dist, 'Electron.app')) &&
    existsSync(stampPath) &&
    readFileSync(stampPath, 'utf8') === stamp
  ) {
    return dist
  }

  console.log('preparing the Ryte dev bundle (once per Electron or icon change)...')
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  cpSync(source, dist, { recursive: true, verbatimSymlinks: true })
  const app = join(dist, 'Electron.app')
  const plist = join(app, 'Contents/Info.plist')
  for (const [key, value] of [
    ['CFBundleName', NAME],
    ['CFBundleDisplayName', NAME],
    ['CFBundleIdentifier', BUNDLE_ID]
  ]) {
    run('plutil', ['-replace', key, '-string', value, plist])
  }
  cpSync(icon, join(app, 'Contents/Resources/electron.icns'))
  // The edit invalidates the signature; an ad-hoc one lets the bundle launch.
  run('codesign', ['--force', '--deep', '--sign', '-', app])
  spawnSync(
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
    ['-f', app]
  )
  writeFileSync(stampPath, stamp)
  return dist
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2)
  if (!command) {
    console.error('usage: node scripts/dev-electron.mjs <command> [args...]')
    process.exit(2)
  }
  const env = { ...process.env }
  try {
    const dist = prepareDevElectron()
    if (dist) env.ELECTRON_OVERRIDE_DIST_PATH = dist
  } catch (error) {
    console.warn(`Could not prepare the Ryte dev bundle, using stock Electron: ${error.message}`)
  }
  const child = spawn(command, args, { stdio: 'inherit', env })
  child.once('close', (code, signal) => process.exit(signal ? 1 : (code ?? 1)))
}
