import type { StoredChunkRow } from '../indexing/vector-store'

export interface WayfindingScenario {
  query: string
  rows: StoredChunkRow[]
  requiredSourcePaths: string[]
}

export interface EvidenceCoverageResult {
  coveredSourcePaths: string[]
  missingSourcePaths: string[]
}

export const JIRA_PLANS_SCENARIO: WayfindingScenario = {
  query: 'jira plans',
  rows: [
    {
      sourcePath: 'plans/jira-migration.md',
      headingPath: ['Decision'],
      date: null,
      text: 'The Jira migration plan replaces the old workflow and names the rollout owner.'
    },
    {
      sourcePath: 'plans/jira-migration.md',
      headingPath: ['Details'],
      date: null,
      text: 'Detailed implementation notes for the migration.'
    },
    {
      sourcePath: 'sessions/delivery-order.md',
      headingPath: ['Jira'],
      date: null,
      text: 'The delivery plan sequences Jira migration before dependent workflow changes.'
    },
    {
      sourcePath: 'sessions/gro-planning.md',
      headingPath: ['Planning'],
      date: null,
      text: 'GRO planning changes the cross-team planning assumptions used by Jira work.'
    },
    {
      sourcePath: 'research/unrelated.md',
      headingPath: ['Notes'],
      date: null,
      text: 'An unrelated archive of design observations.'
    }
  ],
  requiredSourcePaths: [
    'plans/jira-migration.md',
    'sessions/delivery-order.md',
    'sessions/gro-planning.md'
  ]
}

export function evaluateEvidenceCoverage(
  rows: StoredChunkRow[],
  requiredSourcePaths: string[]
): EvidenceCoverageResult {
  const covered = new Set(rows.map((row) => row.sourcePath))
  return {
    coveredSourcePaths: requiredSourcePaths.filter((path) => covered.has(path)),
    missingSourcePaths: requiredSourcePaths.filter((path) => !covered.has(path))
  }
}
