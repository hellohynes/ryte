// ONE-SHOT differential test. It compares the new schemas with the old validators over generated
// inputs while both exist, to catch accept/reject differences the authored vectors did not think of.
// It imports the old validators, so it is deleted together with them in V2.
import { describe, expect, it } from 'vitest'

import { assertValidTaskListInput, assertValidTaskToggleInput } from '../main/ipc-validation'
import { list, toggle } from './tasks'

// Small seeded generator so a failure is reproducible.
function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const numbers: unknown[] = [
  0,
  1,
  -1,
  2,
  3,
  25,
  25.7,
  199.9,
  200,
  200.1,
  201,
  -0,
  -0.5,
  0.5,
  1.5,
  2 ** 31,
  2 ** 53,
  Number.MAX_SAFE_INTEGER,
  1e21,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY
]
const strings: unknown[] = [
  '',
  ' ',
  'a',
  'a.md',
  'folder/tasks.md',
  './a.md',
  'a//b.md',
  'a/./b.md',
  'a/b/',
  '../a.md',
  'a/../b.md',
  '..',
  '.',
  '/',
  '/etc/a.md',
  'C:\\a.md',
  'C:/a.md',
  'C:a.md',
  '\\\\s\\a',
  'a\\b.md',
  'a\0b',
  '- [ ] task',
  'x'.repeat(4096),
  'x'.repeat(4097),
  'x'.repeat(20000),
  'x'.repeat(20001),
  '日本語.md'
]
const others: unknown[] = [
  true,
  false,
  null,
  undefined,
  {},
  [],
  [1],
  new Date(0),
  new Map(),
  'true',
  1
]
const pool: unknown[] = [...numbers, ...strings, ...others]

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)] as T
}

const validToggle = {
  sourcePath: 'folder/tasks.md',
  line: 3,
  checkboxColumn: 2,
  checked: true,
  expectedLine: '- [ ] Follow up'
}

function mutate(random: () => number, base: Record<string, unknown>, keys: string[]): unknown {
  const input: Record<string, unknown> = { ...base }
  const edits = 1 + Math.floor(random() * 3)
  for (let i = 0; i < edits; i += 1) {
    const roll = random()
    const key = pick(random, keys)
    if (roll < 0.25) delete input[key]
    else if (roll < 0.85) input[key] = pick(random, pool)
    else input[pick(random, ['extra', '__unknown', 'limit2', 'Checked'])] = pick(random, pool)
  }
  const wrap = random()
  if (wrap < 0.03) return pick(random, others)
  return input
}

function outcome<T>(run: () => T): { accepted: true; value: T } | { accepted: false } {
  try {
    return { accepted: true, value: run() }
  } catch {
    return { accepted: false }
  }
}

// The known, asserted deviation (see tasks.contract.test.ts): inherited enumerable keys. The generator
// never builds objects with inherited keys, so no case is excluded here.
describe('new schemas agree with the old validators over generated inputs', () => {
  it('tasks.list: same accept/reject and same parsed output', () => {
    const random = mulberry32(0x7a5c1)
    for (let i = 0; i < 20000; i += 1) {
      const input =
        random() < 0.1
          ? pick(random, others)
          : mutate(random, { checked: false, limit: 5 }, ['checked', 'limit'])
      const legacy = outcome(() => assertValidTaskListInput(input))
      const next = list.input.safeParse(input)
      expect(next.success, `list input #${i}`).toBe(legacy.accepted)
      if (legacy.accepted && next.success) expect(next.data).toStrictEqual(legacy.value)
    }
  })

  it('tasks.toggle: same accept/reject and same parsed output', () => {
    const random = mulberry32(0x51de)
    const keys = Object.keys(validToggle)
    for (let i = 0; i < 20000; i += 1) {
      const input = mutate(random, validToggle, keys)
      const legacy = outcome(() => assertValidTaskToggleInput(input))
      const next = toggle.input.safeParse(input)
      expect(next.success, `toggle input #${i}`).toBe(legacy.accepted)
      if (legacy.accepted && next.success) expect(next.data).toStrictEqual(legacy.value)
    }
  })
})
