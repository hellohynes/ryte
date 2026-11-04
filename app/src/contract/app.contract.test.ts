import { describe, expect, it } from 'vitest'

import { app, getVersion } from './app'
import { parseOperationInput } from './define'

describe('app contract', () => {
  it('keeps the wire channel name and the renderer-facing operation name', () => {
    expect(getVersion.channel).toBe('app:get-version')
    expect(Object.keys(app.operations)).toEqual(['getVersion'])
  })

  it('validates the example against its own schemas', () => {
    expect(getVersion.input.safeParse(getVersion.example.input).success).toBe(true)
    expect(getVersion.output.safeParse(getVersion.example.output).success).toBe(true)
  })

  it('accepts no input', () => {
    expect(getVersion.input.safeParse(undefined).success).toBe(true)
  })

  // Accepted deviation: the legacy handler ignored any argument; the contract rejects one.
  it('rejects a stray argument', () => {
    for (const stray of [{}, null, 'x', 0, false]) {
      expect(() => parseOperationInput('app.getVersion', getVersion.input, stray)).toThrow(
        'Invalid app.getVersion input'
      )
    }
  })

  it('returns a string', () => {
    expect(getVersion.output.safeParse('1.2.3').success).toBe(true)
    expect(getVersion.output.safeParse(1).success).toBe(false)
  })
})
