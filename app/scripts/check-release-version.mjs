import { readFile } from 'node:fs/promises'

const tag = process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME
if (!tag) {
  console.error('Set RELEASE_TAG (or run from a GitHub tag workflow) before validating a release.')
  process.exit(1)
}

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const expectedTag = `v${packageJson.version}`

if (tag !== expectedTag) {
  console.error(`Release tag ${tag} does not match app/package.json version ${expectedTag}.`)
  process.exit(1)
}

console.log(`Release tag ${tag} matches app version ${packageJson.version}.`)
