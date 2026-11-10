/** What the locked page view reports: how many things it refused since the page opened, and the last addresses. */
export interface BlockedReport {
  count: number
  addresses: string[]
}

export interface BlockedBannerState {
  /** The latest report from the view. */
  report: BlockedReport
  /** The count when the person last dismissed the banner. */
  dismissedAt: number
}

export const emptyBannerState = (): BlockedBannerState => ({
  report: { count: 0, addresses: [] },
  dismissedAt: 0
})

/** A new report. A count that went down means a new page opened, so nothing counts as dismissed. */
export function receiveReport(
  state: BlockedBannerState,
  report: BlockedReport
): BlockedBannerState {
  return {
    report,
    dismissedAt: report.count < state.report.count ? 0 : state.dismissedAt
  }
}

export function dismissBanner(state: BlockedBannerState): BlockedBannerState {
  return { ...state, dismissedAt: state.report.count }
}

/** What the banner shows: the blocks since it was last dismissed, grouped into one count, or null for none. */
export function visibleBanner(state: BlockedBannerState): BlockedReport | null {
  const count = state.report.count - state.dismissedAt
  if (count <= 0) return null
  return { count, addresses: state.report.addresses.slice(-count) }
}

export function bannerText(count: number): string {
  return `Ryte blocked ${count} ${count === 1 ? 'request' : 'requests'} from this page`
}
