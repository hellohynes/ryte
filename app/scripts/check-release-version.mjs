import { appendFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

const tag = process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME
if (!tag) {
  console.error('Set RELEASE_TAG (or run from a GitHub tag workflow) before validating a release.')
  process.exit(1)
}

// vMAJOR.MINOR.PATCH publishes a release. vMAJOR.MINOR.PATCH-<suffix> (for example
// v0.1.0-rc.1) is a dry run: the workflow builds, signs, notarizes, and verifies, but
// publishes nothing.
const match = /^v(\d+\.\d+\.\d+)(-[0-9A-Za-z][0-9A-Za-z.-]*)?$/.exec(tag)
if (!match) {
  console.error(`Release tag ${tag} must look like v1.2.3, or v1.2.3-rc.1 for a dry run.`)
  process.exit(1)
}

const [, tagVersion, suffix] = match
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

if (tagVersion !== packageJson.version) {
  console.error(
    `Release tag ${tag} does not match app/package.json version v${packageJson.version}.`
  )
  process.exit(1)
}

const dryRun = suffix !== undefined
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${packageJson.version}\ndry_run=${dryRun}\n`)
}

console.log(
  `Release tag ${tag} matches app version ${packageJson.version}${
    dryRun ? ' (dry run: nothing will be published)' : ''
  }.`
)
