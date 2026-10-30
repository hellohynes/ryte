// ONE-SHOT. Records the pre-change behaviour of the old `tasks` validators into
// `tasks.vectors.expected.json`. It imports the old validators, so it is deleted together with them in V2.
// Run from `app/` on the untouched code: node --import tsx src/contract/record/record-vectors.ts
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { assertValidTaskListInput, assertValidTaskToggleInput } from '../../main/ipc-validation'
import { encode } from '../tasks.vectors.codec'
import { taskVectors } from '../tasks.vectors.inputs'

const out = resolve(import.meta.dirname, '../tasks.vectors.expected.json')

const recorded = taskVectors.map((vector) => {
  const validate = vector.op === 'list' ? assertValidTaskListInput : assertValidTaskToggleInput
  try {
    return { id: vector.id, op: vector.op, accepted: true, output: encode(validate(vector.input)) }
  } catch (error) {
    // The legacy message is informational only (decision D4 drops message text as a contract).
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
  command: 'node --import tsx src/contract/record/record-vectors.ts',
  note: 'Recorded from the pre-change validators on main. Expectations are the oracle; do not regenerate from new code.'
}

writeFileSync(out, `${JSON.stringify({ header, vectors: recorded }, null, 2)}\n`)
const accepted = recorded.filter((entry) => entry.accepted).length
console.log(
  `Recorded ${recorded.length} vectors (${accepted} accepted, ${recorded.length - accepted} rejected)`
)
