import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { ContractInputError, parseOperationInput } from './define'
import { list, refresh, toggle } from './tasks'
import { decode } from './tasks.vectors.codec'
import { ACCEPTED_DEVIATIONS } from './tasks.vectors.deviations'
import { taskVectors } from './tasks.vectors.inputs'

interface RecordedVector {
  id: string
  op: 'list' | 'toggle'
  accepted: boolean
  output?: unknown
}

const recorded = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL('./tasks.vectors.expected.json', import.meta.url)), 'utf8')
  ) as { vectors: RecordedVector[] }
).vectors

const schemas = { list: list.input, toggle: toggle.input }

describe('tasks contract against the golden vectors recorded from the pre-change validators', () => {
  it('records exactly one expectation for every authored vector', () => {
    expect(recorded.map((vector) => vector.id)).toEqual(taskVectors.map((vector) => vector.id))
    expect(recorded.map((vector) => vector.op)).toEqual(taskVectors.map((vector) => vector.op))
  })

  it.each(taskVectors.map((vector, index) => [vector.id, vector, recorded[index]] as const))(
    '%s',
    (_id, vector, expected) => {
      const result = schemas[vector.op].safeParse(vector.input)
      const deviation = ACCEPTED_DEVIATIONS[vector.id]
      if (deviation) {
        expect(expected.accepted, 'the legacy validator accepted this input').toBe(true)
        expect(result.success, deviation.reason).toBe(deviation.accepted)
        return
      }
      expect(result.success, `accept/reject for ${vector.id}`).toBe(expected.accepted)
      if (expected.accepted && result.success) {
        expect(result.data).toStrictEqual(decode(expected.output))
      }
    }
  )

  it('keeps the vectors that distinguish a strict schema from a lenient one', () => {
    const inputs = taskVectors.map((vector) => vector.input)
    const objects = inputs.filter(
      (input): input is Record<string, unknown> => typeof input === 'object' && input !== null
    )
    const values = objects.flatMap((object) => Object.values(object))

    expect(values.some((value) => Number.isNaN(value))).toBe(true)
    expect(values.some((value) => value === Number.POSITIVE_INFINITY)).toBe(true)
    expect(values.some((value) => Object.is(value, -0))).toBe(true)
    expect(values.some((value) => value === 2 ** 53)).toBe(true)
    expect(objects.some((object) => Object.values(object).includes(undefined))).toBe(true)
    expect(objects.some((object) => Object.keys(object).includes('__proto__'))).toBe(true)
    expect(objects.some((object) => Object.getOwnPropertySymbols(object).length > 0)).toBe(true)
    expect(objects.some((object) => Object.getPrototypeOf(object) === null)).toBe(true)
    expect(inputs.some((input) => input instanceof Date)).toBe(true)
    expect(inputs.some((input) => input instanceof Map)).toBe(true)
    expect(inputs).toContain(undefined)
    expect(inputs).toContain(null)
  })

  it('has accepted and rejected examples for both operations', () => {
    for (const op of ['list', 'toggle'] as const) {
      const forOp = recorded.filter((vector) => vector.op === op)
      expect(forOp.some((vector) => vector.accepted)).toBe(true)
      expect(forOp.some((vector) => !vector.accepted)).toBe(true)
    }
  })
})

describe('tasks contract definitions', () => {
  it('validates each operation example against its own schemas', () => {
    for (const operation of [list, refresh, toggle]) {
      expect(operation.input.safeParse(operation.example.input).success).toBe(true)
      expect(operation.output.safeParse(operation.example.output).success).toBe(true)
    }
  })

  it('keeps the wire channel names', () => {
    expect([list.channel, refresh.channel, toggle.channel]).toEqual([
      'tasks:list',
      'tasks:refresh',
      'tasks:toggle'
    ])
  })

  it('accepts no input for refresh', () => {
    expect(refresh.input.safeParse(undefined).success).toBe(true)
    expect(refresh.input.safeParse({}).success).toBe(false)
  })
})

describe('rejected input errors', () => {
  it('names the operation and issue paths but never echoes input values', () => {
    const secretPath = '/Users/private/secret-notes/tasks.md'
    const secretKey = 'secret-key-name'

    for (const input of [
      { sourcePath: secretPath, line: 3, checkboxColumn: 2, checked: true, expectedLine: 'x' },
      {
        sourcePath: 'a.md',
        line: 3,
        checkboxColumn: 2,
        checked: true,
        expectedLine: 'x',
        [secretKey]: 1
      },
      { sourcePath: 'secret/../../x.md', line: 'secret-line', checkboxColumn: 2, checked: 'secret' }
    ]) {
      let thrown: unknown
      try {
        parseOperationInput('tasks.toggle', toggle.input, input)
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(ContractInputError)
      const message = (thrown as Error).message
      expect(message.startsWith('Invalid tasks.toggle input')).toBe(true)
      expect(message).not.toMatch(/secret|Users|private/)
    }
  })

  it('returns the parsed value for valid input', () => {
    expect(parseOperationInput('tasks.list', list.input, undefined)).toStrictEqual({})
  })
})
