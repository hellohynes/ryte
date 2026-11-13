import { app } from 'electron'

import { createKeptViewPool } from './kept-view-pool'
import { KEPT_VIEWS_BUDGET_BYTES, KEPT_VIEWS_CEILING } from './sleep-pick'

/**
 * The app's one pool: every kept view of the page box and the local box, in every window, counts toward the same
 * memory budget and ceiling. A hidden test launch of an unpackaged app may lower the ceiling with
 * `RYTE_TEST_KEPT_CEILING` and the budget with `RYTE_TEST_KEPT_BUDGET_MB` so the built-app check can make views
 * sleep with a few pages; a packaged app ignores both.
 */
const testing = !app.isPackaged && process.env['RYTE_TEST_HIDDEN'] === '1'
const override = (name: string): number | null => {
  const value = Number(process.env[name])
  return testing && Number.isFinite(value) && value > 0 ? value : null
}
const budgetMb = override('RYTE_TEST_KEPT_BUDGET_MB')

export const appKeptViewPool = createKeptViewPool({
  metrics: () => app.getAppMetrics(),
  budgetBytes: budgetMb === null ? KEPT_VIEWS_BUDGET_BYTES : budgetMb * 1024 * 1024,
  ceiling: override('RYTE_TEST_KEPT_CEILING') ?? KEPT_VIEWS_CEILING
})
