import { describe, expect, it, vi } from 'vitest'

// The contract must stay transport-neutral. Loading Electron anywhere in its import graph throws.
vi.mock('electron', () => {
  throw new Error('src/contract must not load electron')
})

describe('contract is transport-neutral', () => {
  it('loads the whole registry in plain Node without Electron', async () => {
    const { contract } = await import('./index')

    expect(Object.keys(contract)).toEqual(['tasks'])
    expect(Object.keys(contract.tasks.operations)).toEqual(
      expect.arrayContaining(['list', 'refresh', 'toggle'])
    )
    expect(Object.keys(contract.tasks.events)).toEqual(expect.arrayContaining(['changed']))
  })

  it('validates the example of every operation, in every area, against its own schemas', async () => {
    const { contract } = await import('./index')
    for (const [areaName, area] of Object.entries(contract)) {
      for (const [operationName, operation] of Object.entries(area.operations)) {
        const name = `${areaName}.${operationName}`
        expect(operation.input.safeParse(operation.example.input).success, `${name} input`).toBe(
          true
        )
        expect(operation.output.safeParse(operation.example.output).success, `${name} output`).toBe(
          true
        )
      }
    }
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
