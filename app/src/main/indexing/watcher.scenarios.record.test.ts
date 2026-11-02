// ONE-SHOT recorder, skipped unless RYTE_RECORD_WATCHER=1. It records the chokidar-based watcher's reduction of every scenario three
// times and writes `watcher.scenarios.expected.json` only if the three runs are identical. It runs the real `Watcher`, so it is deleted
// when the watcher is replaced (the recording stays in git history); never record from new code.
// Run from `app/`: RYTE_RECORD_WATCHER=1 corepack pnpm exec vitest run src/main/indexing/watcher.scenarios.record.test.ts
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

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

const RUNS = 3

describe.skipIf(!process.env['RYTE_RECORD_WATCHER'])('record the chokidar watcher', () => {
  it('records every scenario three times and writes the oracle if the runs agree', async () => {
    const recorded: Record<string, Reduction> = {}
    const unstable: string[] = []
    for (const scenario of scenarios) {
      const runs: Reduction[] = []
      for (let i = 0; i < RUNS; i += 1) {
        runs.push(await runScenario(scenario, { make: () => new Watcher(), indexCalls }))
      }
      const first = JSON.stringify(runs[0])
      if (runs.some((run) => JSON.stringify(run) !== first || run.cappedBeforeQuiet)) {
        unstable.push(`${scenario.id}\n${runs.map((run) => JSON.stringify(run)).join('\n')}`)
      }
      recorded[scenario.id] = runs[0] as Reduction
    }
    expect(unstable, 'scenarios whose reduction differs between runs').toEqual([])

    const header = {
      baseSha: execSync('git merge-base HEAD origin/main', { encoding: 'utf8' }).trim(),
      recordedFrom: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
      runs: RUNS,
      command:
        'RYTE_RECORD_WATCHER=1 corepack pnpm exec vitest run src/main/indexing/watcher.scenarios.record.test.ts',
      note: 'Recorded from the chokidar-based Watcher, three identical runs per scenario. Expectations are the oracle; do not regenerate from new code.'
    }
    writeFileSync(
      fileURLToPath(new URL('./watcher.scenarios.expected.json', import.meta.url)),
      `${JSON.stringify({ header, scenarios: recorded }, null, 2)}\n`
    )
  }, 1_800_000)
})
