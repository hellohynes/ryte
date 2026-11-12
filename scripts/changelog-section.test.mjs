import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { changelogSection } from './changelog-section.mjs'

const script = fileURLToPath(new URL('./changelog-section.mjs', import.meta.url))
const run = (version) => spawnSync(process.execPath, [script, version], { encoding: 'utf8' })

test('the real CHANGELOG gives the 0.3.0 section and stops before 0.2.0', () => {
  const { status, stdout } = run('0.3.0')
  assert.equal(status, 0)
  assert.ok(stdout.startsWith('### Highlights\n\nRyte now opens more of your work'))
  assert.ok(stdout.includes('#### File viewing'))
  assert.ok(!stdout.includes('## 0.2.0'))
  assert.ok(!stdout.includes('earlier numbering'))
})

test('a version with no section fails', () => {
  const { status, stderr } = run('9.9.9')
  assert.notEqual(status, 0)
  assert.match(stderr, /no section "## 9.9.9"/)
})

test('an "(earlier numbering)" heading is not the section for that version', () => {
  assert.equal(changelogSection('## 0.3.0 (earlier numbering)\n\nold text\n', '0.3.0'), null)
})
