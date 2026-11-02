// ONE-SHOT. Records the pre-change behaviour of the old `settings` validators into
// `settings.vectors.expected.json`. It imports the old validators, so it is deleted together with them when
// the settings area moves onto the registry; the recording stays in git history.
// Run from `app/` on the untouched code: node --import tsx src/contract/record/record-settings-vectors.ts
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { assertValidProviderId, assertValidSettingsPatch } from '../../main/ipc-validation'
import { encode } from '../tasks.vectors.codec'
import { settingsVectors } from '../settings.vectors.inputs'

const out = resolve(import.meta.dirname, '../settings.vectors.expected.json')

const recorded = settingsVectors.map((vector) => {
  const validate = vector.op === 'save' ? assertValidSettingsPatch : assertValidProviderId
  try {
    return { id: vector.id, op: vector.op, accepted: true, output: encode(validate(vector.input)) }
  } catch (error) {
    // The legacy message is informational only: the text of a validation error is not a contract.
    return {
      id: vector.id,
      op: vector.op,
      accepted: false,
      legacyMessage: error instanceof Error ? error.message : String(error)
    }
  }
})

const ids = new Set(recorded.map((entry) => entry.id))
if (ids.size !== recorded.length) throw new Error('Vector ids must be unique')

const header = {
  recordedFrom: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
  baseSha: execSync('git merge-base HEAD origin/main', { encoding: 'utf8' }).trim(),
  command: 'node --import tsx src/contract/record/record-settings-vectors.ts',
  note: 'Recorded from the pre-change validators (assertValidSettingsPatch, assertValidProviderId). The validators and shared/ are unchanged from baseSha. Expectations are the oracle; do not regenerate from new code.'
}

writeFileSync(out, `${JSON.stringify({ header, vectors: recorded }, null, 2)}\n`)
const accepted = recorded.filter((entry) => entry.accepted).length
console.log(
  `Recorded ${recorded.length} vectors (${accepted} accepted, ${recorded.length - accepted} rejected)`
)
