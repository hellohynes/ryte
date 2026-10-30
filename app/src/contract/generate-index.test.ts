import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { describeFields } from '../../scripts/generate-contract'

describe('describeFields (the input column of docs/api-index.md)', () => {
  it('lists the fields of an object, marking optional ones', () => {
    expect(describeFields(z.strictObject({ a: z.string(), b: z.number().optional() }))).toBe(
      '{ a: string, b?: number }'
    )
  })

  it('describes the inside of a preprocess wrapper', () => {
    const schema = z.preprocess(
      (value) => value ?? {},
      z.strictObject({ limit: z.number().optional() })
    )
    expect(describeFields(schema)).toBe('{ limit?: number }')
  })

  it('says none for no input and for no payload', () => {
    expect(describeFields(z.undefined())).toBe('none')
    expect(describeFields(undefined)).toBe('none')
  })

  it('never documents an input it cannot describe as taking none', () => {
    const union = z.union([z.strictObject({ a: z.string() }), z.strictObject({ b: z.number() })])
    expect(describeFields(union)).toBe('see schema')
    expect(describeFields(z.string())).toBe('string')
  })
})
