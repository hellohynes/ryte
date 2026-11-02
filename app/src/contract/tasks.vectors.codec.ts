// Tagged JSON encoding for the golden vectors' recorded outputs. Plain JSON cannot carry undefined,
// NaN, Infinity or -0, and those are the values that distinguish a strict validator from a lenient one.

export type Encoded = unknown

// `out[key] = value` with key `__proto__` sets the prototype and drops the key. Define it as data instead.
function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true
  })
}

export function encode(value: unknown): Encoded {
  if (value === undefined) return { $undefined: true }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { $nan: true }
    if (value === Number.POSITIVE_INFINITY) return { $infinity: 1 }
    if (value === Number.NEGATIVE_INFINITY) return { $infinity: -1 }
    if (Object.is(value, -0)) return { $negativeZero: true }
    return value
  }
  if (Array.isArray(value)) {
    // JSON turns a hole into null. Keep the holes: `.map` over a sparse array is how a validator can accept one.
    if (Object.keys(value).length !== value.length) {
      return {
        $sparse: {
          length: value.length,
          entries: Object.keys(value).map((index) => [Number(index), encode(value[Number(index)])])
        }
      }
    }
    return value.map(encode)
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      setOwn(out, key, encode(Object.getOwnPropertyDescriptor(value, key)?.value))
    }
    return out
  }
  return value
}

export function decode(value: Encoded): unknown {
  if (Array.isArray(value)) return value.map(decode)
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (record.$undefined === true) return undefined
    if (record.$nan === true) return Number.NaN
    if (record.$infinity === 1) return Number.POSITIVE_INFINITY
    if (record.$infinity === -1) return Number.NEGATIVE_INFINITY
    if (record.$negativeZero === true) return -0
    if (record.$sparse !== undefined) {
      const { length, entries } = record.$sparse as { length: number; entries: [number, unknown][] }
      const array: unknown[] = new Array(length)
      for (const [index, entry] of entries) array[index] = decode(entry)
      return array
    }
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(record)) {
      setOwn(out, key, decode(Object.getOwnPropertyDescriptor(record, key)?.value))
    }
    return out
  }
  return value
}
