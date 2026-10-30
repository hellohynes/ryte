import { describe, expect, it } from 'vitest'

import { fixtureStatusEvent, fixtureWhoAmI } from './shapes.fixture'

describe('shape fixtures', () => {
  it('carry a payload schema on the event and a typed example on the operation', () => {
    expect(fixtureStatusEvent.payload?.safeParse({ phase: 'idle', done: 0 }).success).toBe(true)
    expect(fixtureStatusEvent.payload?.safeParse({ phase: 'later', done: 0 }).success).toBe(false)
    expect(fixtureWhoAmI.output.safeParse(fixtureWhoAmI.example.output).success).toBe(true)
  })
})
