import { describe, expect, it } from 'vitest'

import { parseOperationInput } from './define'
import { dialog, openFolder } from './dialog'

describe('dialog contract', () => {
  it('keeps the wire channel name and the renderer-facing operation name', () => {
    expect(openFolder.channel).toBe('dialog:open-folder')
    expect(Object.keys(dialog.operations)).toEqual(['openFolder'])
  })

  it('has no operation for the deleted file picker', () => {
    expect('openFile' in dialog.operations).toBe(false)
  })

  it('validates the example against its own schemas', () => {
    expect(openFolder.input.safeParse(openFolder.example.input).success).toBe(true)
    expect(openFolder.output.safeParse(openFolder.example.output).success).toBe(true)
  })

  it('accepts no input', () => {
    expect(openFolder.input.safeParse(undefined).success).toBe(true)
  })

  // Accepted deviation: the legacy handler ignored any argument; the contract rejects one.
  it('rejects a stray argument', () => {
    for (const stray of [{}, null, '/tmp', 0, false]) {
      expect(() => parseOperationInput('dialog.openFolder', openFolder.input, stray)).toThrow(
        'Invalid dialog.openFolder input'
      )
    }
  })

  it('returns a path or null', () => {
    expect(openFolder.output.safeParse('/a').success).toBe(true)
    expect(openFolder.output.safeParse(null).success).toBe(true)
    expect(openFolder.output.safeParse(undefined).success).toBe(false)
  })
})
