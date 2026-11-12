export interface PageScroll {
  x: number
  y: number
}

// Far past any real page, so a page that reports a huge number cannot make the restore script absurd.
const MAX_SCROLL = 10_000_000

/** The page's reply to the scroll question is untrusted: only two sane numbers are used. */
export function parseScroll(value: unknown): PageScroll | null {
  if (!Array.isArray(value) || value.length !== 2) return null
  const [x, y] = value as unknown[]
  if (typeof x !== 'number' || typeof y !== 'number') return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const clamp = (n: number): number => Math.min(Math.max(Math.round(n), 0), MAX_SCROLL)
  return { x: clamp(x), y: clamp(y) }
}

/** The script that asks a page where it is scrolled to. */
export const READ_SCROLL_SCRIPT = '[window.scrollX, window.scrollY]'

/** The script that puts a page back where it was. Built only from numbers this module has checked. */
export function restoreScrollScript(scroll: PageScroll): string {
  return `window.scrollTo({ left: ${scroll.x}, top: ${scroll.y}, behavior: 'instant' })`
}
