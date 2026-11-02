import { describe, expect, it } from 'vitest'

import { decode, encode } from './tasks.vectors.codec'

// An own `__proto__` key (made by JSON.parse, or defineProperty) is data, not a prototype assignment.
const withOwnProto = (): Record<string, unknown> =>
  JSON.parse('{"__proto__":{"x":1},"nested":{"__proto__":{"y":2}},"plain":1}')

describe('the vectors codec keeps an own __proto__ key', () => {
  it('encodes it as an own key and leaves the prototype alone', () => {
    const encoded = encode(withOwnProto()) as Record<string, unknown>

    expect(Object.keys(encoded)).toContain('__proto__')
    expect(Object.getPrototypeOf(encoded)).toBe(Object.prototype)
    expect(Object.keys(encoded.nested as object)).toContain('__proto__')
  })

  it('round-trips it, at the top level and nested', () => {
    const decoded = decode(JSON.parse(JSON.stringify(encode(withOwnProto())))) as Record<
      string,
      unknown
    >

    expect(Object.keys(decoded)).toEqual(['__proto__', 'nested', 'plain'])
    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype)
    expect(Object.getOwnPropertyDescriptor(decoded, '__proto__')?.value).toEqual({ x: 1 })
    expect(Object.keys(decoded.nested as object)).toEqual(['__proto__'])
  })

  it('still encodes the values plain JSON cannot carry', () => {
    const roundTrip = decode(
      JSON.parse(JSON.stringify(encode({ a: undefined, b: Number.NaN, c: -0, d: [Infinity] })))
    ) as Record<string, unknown>

    expect(Object.keys(roundTrip)).toEqual(['a', 'b', 'c', 'd'])
    expect(roundTrip.a).toBeUndefined()
    expect(Number.isNaN(roundTrip.b)).toBe(true)
    expect(Object.is(roundTrip.c, -0)).toBe(true)
    expect(roundTrip.d).toEqual([Number.POSITIVE_INFINITY])
  })

  it('keeps the holes of a sparse array instead of turning them into null', () => {
    const sparse: unknown[] = []
    sparse[2] = 'openai'
    const decoded = decode(JSON.parse(JSON.stringify(encode(sparse)))) as unknown[]

    expect(decoded).toHaveLength(3)
    expect(Object.keys(decoded)).toEqual(['2'])
    expect(0 in decoded).toBe(false)
    expect(decoded[2]).toBe('openai')
    // A dense array with a null in it is not a hole.
    const dense = decode(JSON.parse(JSON.stringify(encode([null, 'openai'])))) as unknown[]
    expect(Object.keys(dense)).toEqual(['0', '1'])
  })
})
