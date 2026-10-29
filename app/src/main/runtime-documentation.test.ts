import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('runtime documentation', () => {
  it('test_phase_zero_manual_smoke_declares_the_node_24_runtime_contract', () => {
    const manualSmokePath = resolve(import.meta.dirname, '../../../docs/phase-0-manual-smoke.md')
    const manualSmoke = readFileSync(manualSmokePath, 'utf8')

    expect(manualSmoke).toContain('Node 24')
    expect(manualSmoke).not.toContain('Node 22')
  })
})
