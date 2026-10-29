import { access } from 'node:fs/promises'
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
run('spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath])

console.log(`Verified signed and accepted macOS release artifact: ${artifactName}`)
