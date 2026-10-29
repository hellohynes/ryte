import { describe, expect, it } from 'vitest'

import { buildEvidenceBundle } from './evidence-bundle'
import { evaluateEvidenceCoverage, JIRA_PLANS_SCENARIO } from './wayfinding-evaluation'

describe('Jira plans wayfinding scenario', () => {
  it('requires evidence from migration, delivery, and GRO planning instead of one document cluster', () => {
    const evidence = buildEvidenceBundle(JIRA_PLANS_SCENARIO.rows, 8, 12)

    expect(evaluateEvidenceCoverage(evidence, JIRA_PLANS_SCENARIO.requiredSourcePaths)).toEqual({
      coveredSourcePaths: JIRA_PLANS_SCENARIO.requiredSourcePaths,
      missingSourcePaths: []
    })
  })

  it('detects an answer input anchored only to one source area', () => {
    expect(
      evaluateEvidenceCoverage(
        JIRA_PLANS_SCENARIO.rows.slice(0, 2),
        JIRA_PLANS_SCENARIO.requiredSourcePaths
      )
    ).toEqual({
      coveredSourcePaths: ['plans/jira-migration.md'],
      missingSourcePaths: ['sessions/delivery-order.md', 'sessions/gro-planning.md']
    })
  })
})
