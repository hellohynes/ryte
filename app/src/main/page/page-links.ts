/** How long after a real mouse-up or Enter in the page a link may be opened. */
export const REAL_INPUT_WINDOW_MS = 1000

/** The kinds of address a page may open in the browser. */
export const OPENABLE_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:', 'mailto:'])

/** Only a web address or a mail link ever leaves the box. `file:`, `javascript:`, `data:`, `blob:` and every other scheme are refused. */
export function isOpenablePageLink(url: string): boolean {
  try {
    return OPENABLE_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

export interface RealInputGate {
  /** A real mouse-up or Enter reached the page. It comes from the operating system, never from the page's script. */
  note(): void
  /** Whether a recent real input has not been used yet; using it spends it. */
  consume(): boolean
  /** Whether a real input was recent, without spending it. */
  recent(): boolean
}

/**
 * Remembers the latest real input to the page so a link opens only because the person clicked. Electron has no
 * user-gesture flag on a navigation or a window-open, so the check is "a real click or Enter just before". It
 * is used once, so one click opens one link.
 */
export function createRealInputGate(now: () => number = Date.now): RealInputGate {
  let lastInputAt = Number.NEGATIVE_INFINITY
  return {
    note: () => {
      lastInputAt = now()
    },
    consume: () => {
      const recent = now() - lastInputAt <= REAL_INPUT_WINDOW_MS
      lastInputAt = Number.NEGATIVE_INFINITY
      return recent
    },
    recent: () => now() - lastInputAt <= REAL_INPUT_WINDOW_MS
  }
}

/**
 * Opens a link from the page in the browser when it is an allowed kind and the person just clicked.
 * Returns whether it was opened.
 */
export function createPageLinkOpener(
  gate: RealInputGate,
  openExternal: (url: string) => void
): (url: string) => boolean {
  return (url) => {
    if (!isOpenablePageLink(url) || !gate.consume()) return false
    openExternal(url)
    return true
  }
}
