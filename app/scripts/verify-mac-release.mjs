import { access, readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const version = process.env.RELEASE_VERSION
if (!version) {
  console.error('Set RELEASE_VERSION before verifying a macOS release artifact.')
  process.exit(1)
}

const artifactName = `ryte-${version}-arm64.dmg`
const appPath = join('dist', 'mac-arm64', 'Ryte.app')
const executablePath = join(appPath, 'Contents', 'MacOS', 'ryte')

await access(join('dist', artifactName))
await access(executablePath)

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const lipo = spawnSync('lipo', ['-archs', executablePath], { encoding: 'utf8' })
if (lipo.status !== 0 || lipo.stdout.trim() !== 'arm64') {
  console.error(
    `Expected an arm64 application executable, received: ${lipo.stdout.trim() || 'none'}.`
  )
  process.exit(lipo.status ?? 1)
}

run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath])

// Under the hardened runtime, Chromium's helper processes (renderer, GPU) need the JIT
// entitlement themselves; they do not inherit it from the main executable. Without it the
// renderer aborts at startup and Ryte shows a menu bar but no window, even though the
// signature verifies and Apple notarizes the build.
const frameworksPath = join(appPath, 'Contents', 'Frameworks')
const helpers = (await readdir(frameworksPath)).filter((name) =>
  /^Ryte Helper( \(.+\))?\.app$/.test(name)
)
if (helpers.length === 0) {
  console.error(`No helper apps found in ${frameworksPath}.`)
  process.exit(1)
}
for (const helper of helpers) {
  const entitlements = spawnSync(
    'codesign',
    ['-d', '--entitlements', ':-', join(frameworksPath, helper)],
    { encoding: 'utf8' }
  )
  if (!entitlements.stdout.includes('com.apple.security.cs.allow-jit')) {
    console.error(
      `${helper} is missing com.apple.security.cs.allow-jit; its renderer would crash at launch. Check build/entitlements.mac.inherit.plist.`
    )
    process.exit(1)
  }
}

run('spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath])

console.log(`Verified signed and accepted macOS release artifact: ${artifactName}`)
