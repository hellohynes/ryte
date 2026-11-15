import { randomBytes } from 'node:crypto'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { validateAskInput } from './contract.mjs'

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

export function defaultMakeId(now) {
  const day = now.toISOString().slice(0, 10).replaceAll('-', '')
  const suffix = Array.from(randomBytes(6), (byte) => ALPHABET[byte % ALPHABET.length]).join('')
  return `q-${day}-${suffix}`
}

export function createAsk({ dir, now = () => new Date(), makeId = defaultMakeId }) {
  return async function ask(input) {
    const valid = validateAskInput(input)
    const at = now()
    const id = makeId(at)
    const { session, ...rest } = valid
    const record = { contract: 'ryte.question/1', id, session, askedAt: at.toISOString(), ...rest }

    const folder = join(dir, 'questions')
    await mkdir(folder, { recursive: true })
    const path = join(folder, `${id}.json`)
    // Written beside the target and renamed, so a reader never sees half a file.
    const temp = join(folder, `.${id}.${randomBytes(4).toString('hex')}.tmp`)
    await writeFile(temp, `${JSON.stringify(record, null, 2)}\n`)
    await rename(temp, path)
    return { id, path }
  }
}
