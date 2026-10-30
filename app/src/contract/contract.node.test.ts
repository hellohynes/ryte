import { describe, expect, it, vi } from 'vitest'

// The contract must stay transport-neutral. Loading Electron anywhere in its import graph throws.
vi.mock('electron', () => {
  throw new Error('src/contract must not load electron')
})

describe('contract is transport-neutral', () => {
  it('loads the whole registry in plain Node without Electron', async () => {
    const { contract } = await import('./index')

    expect(Object.keys(contract)).toEqual(['tasks'])
    expect(Object.keys(contract.tasks.operations)).toEqual(['list', 'refresh', 'toggle'])
    expect(Object.keys(contract.tasks.events)).toEqual(['changed'])
  })

  it('defines every operation with a description and a unique channel', async () => {
    const { contract } = await import('./index')
    const channels: string[] = []
    for (const area of Object.values(contract)) {
      for (const operation of Object.values(area.operations)) {
        expect(operation.description.length).toBeGreaterThan(0)
        channels.push(operation.channel)
      }
      for (const event of Object.values(area.events)) {
        expect(event.description.length).toBeGreaterThan(0)
        channels.push(event.channel)
      }
    }
    expect(new Set(channels).size).toBe(channels.length)
  })
})
