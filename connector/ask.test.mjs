import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { createAsk } from './ask.mjs'

let dir
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ryte-answers-'))
})
after(() => rm(dir, { recursive: true, force: true }))

const choice = (options) => ({ type: 'choice', id: 'length', title: 'Length', question: 'Short or long?', options })
const text = { type: 'text', id: 'note', title: 'Note', question: 'Anything else?' }
const options = [
  { id: 'short', label: 'Short' },
  { id: 'long', label: 'Long' },
]

test('a good question is saved as a contract record', async () => {
  const ask = createAsk({ dir })
  const { id, path } = await ask({ session: 'blog-intro', title: 'Intro length', decisions: [choice(options), text] })
  const saved = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(saved.contract, 'ryte.question/1')
  assert.equal(saved.id, id)
  assert.equal(saved.session, 'blog-intro')
  assert.ok(!Number.isNaN(Date.parse(saved.askedAt)))
  assert.deepEqual(saved.decisions.map((d) => d.id), ['length', 'note'])
})

test('a choice with one option is refused and nothing is written', async () => {
  const empty = await mkdtemp(join(tmpdir(), 'ryte-answers-'))
  try {
    const ask = createAsk({ dir: empty })
    await assert.rejects(
      ask({ session: 'blog-intro', title: 'Intro length', decisions: [choice([options[0]])] }),
      /options/,
    )
    const files = await readdir(join(empty, 'questions')).catch(() => [])
    assert.deepEqual(files, [])
  } finally {
    await rm(empty, { recursive: true, force: true })
  }
})
