import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./check-release-version.mjs', import.meta.url))
const { version } = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')
)

function checkTag(tag) {
  const dir = mkdtempSync(join(tmpdir(), 'ryte-release-tag-'))
  const outputFile = join(dir, 'github-output')
  try {
    const result = spawnSync(process.execPath, [script], {
      env: { PATH: process.env.PATH, RELEASE_TAG: tag, GITHUB_OUTPUT: outputFile },
      encoding: 'utf8'
    })
    let output = ''
    try {
      output = readFileSync(outputFile, 'utf8')
    } catch {
      // The script writes outputs only for an accepted tag.
    }
    return { status: result.status, output }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('a tag equal to the app version publishes a release', () => {
  const { status, output } = checkTag(`v${version}`)
  assert.equal(status, 0)
  assert.match(output, new RegExp(`version=${version.replaceAll('.', '\\.')}\\n`))
  assert.match(output, /dry_run=false\n/)
})

test('a tag with a prerelease suffix is a dry run', () => {
  const { status, output } = checkTag(`v${version}-rc.1`)
  assert.equal(status, 0)
  assert.match(output, /dry_run=true\n/)
})

test('a tag for a different version is rejected', () => {
  assert.equal(checkTag('v999.0.0').status, 1)
  assert.equal(checkTag('v999.0.0-rc.1').status, 1)
})

test('a malformed tag is rejected', () => {
  for (const tag of [version, `v${version}-`, `v${version}x`, `v${version}.1`, 'latest', '']) {
    assert.equal(checkTag(tag).status, 1, `expected "${tag}" to be rejected`)
  }
})
