import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { describeFields } from '../../scripts/generate-contract'

describe('describeFields (the input column of docs/api-index.md)', () => {
  it('renders a nullable field as a union, not a comma list', () => {
    expect(describeFields(z.object({ at: z.string().nullable(), n: z.number() }))).toBe(
      '{ at: string | null, n: number }'
    )
  })

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

  it('renders enum values, literals, array items, unions and nested objects', () => {
    const schema = z.strictObject({
      mode: z.enum(['light', 'dark']).optional(),
      only: z.literal('x'),
      names: z.array(z.string()),
      kinds: z.array(z.enum(['a', 'b'])).optional(),
      maybe: z.string().nullable(),
      holder: z
        .strictObject({ id: z.string(), kind: z.enum(['a', 'b']) })
        .nullable()
        .optional(),
      loose: z.object({}).optional()
    })

    expect(describeFields(schema)).toBe(
      "{ mode?: 'light' | 'dark', only: 'x', names: string[], kinds?: ('a' | 'b')[], maybe: string | null, " +
        "holder?: { id: string, kind: 'a' | 'b' } | null, loose?: object }"
    )
  })

  it('says unknown for a field it cannot represent', () => {
    expect(describeFields(z.object({ custom: z.custom<string>(() => true) }))).toBe(
      '{ custom: unknown }'
    )
  })
})
