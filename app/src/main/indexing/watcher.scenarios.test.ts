import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { IndexCall, Reduction } from './watcher.scenarios'

const indexCalls: IndexCall[] = []

vi.mock('./indexer-service', () => ({
  indexerService: {
    notifyFileChanged: async (path: string): Promise<void> => {
      indexCalls.push({ op: 'changed', path })
    },
    notifyFileRemoved: async (path: string): Promise<void> => {
      indexCalls.push({ op: 'removed', path })
    }
  }
}))

import { scenarios, runScenario } from './watcher.scenarios'
import { Watcher } from './watcher'

interface Expected {
  header: { baseSha: string; runs: number }
  scenarios: Record<string, Reduction>
}

const expected = JSON.parse(
  readFileSync(fileURLToPath(new URL('./watcher.scenarios.expected.json', import.meta.url)), 'utf8')
) as Expected

// The watcher is a macOS one (recursive native watching); the scenarios use a real temporary directory.
describe.skipIf(process.platform !== 'darwin')(
  'the notes watcher against the recorded scenarios',
  () => {
    beforeEach(() => {
      indexCalls.length = 0
    })

    it('has a recorded reduction for every scenario, and no stale one', () => {
      expect(Object.keys(expected.scenarios).sort()).toEqual(
        scenarios.map((scenario) => scenario.id).sort()
      )
      expect(expected.header.runs).toBeGreaterThanOrEqual(3)
      expect(expected.header.baseSha).toMatch(/^[0-9a-f]{40}$/)
    })

    it.each(scenarios.map((scenario) => [scenario.id, scenario] as const))(
      '%s',
      async (_id, scenario) => {
        const result = await runScenario(scenario, { make: () => new Watcher(), indexCalls })
        const want = expected.scenarios[scenario.id] as Reduction

        expect(result.cappedBeforeQuiet, 'the watcher never went quiet').toBe(false)
        expect(result.rootOnEveryEvent, 'every event carries the notes root').toBe(true)
        if (scenario.informational) return
        expect(result.tree, 'file tree reported changed').toBe(want.tree)
        expect(result.catalog, 'last catalog operation per path').toEqual(want.catalog)
        expect(result.index, 'last index operation per path').toEqual(want.index)
        if (scenario.maxIndexCalls !== undefined) {
          expect(indexCalls.length, 'index calls').toBeLessThanOrEqual(scenario.maxIndexCalls)
        }
      },
      60_000
    )
  }
)
