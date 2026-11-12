/**
 * Where each note and code tab was scrolled to when the person left it, for the rest of this run, so coming back
 * to a tab finds the text where it was. Not saved to disk. An HTML page keeps its own position in its own view.
 */
const MAX_REMEMBERED = 200
const positions = new Map<string, number>()

export function rememberTabScroll(key: string, top: number): void {
  positions.delete(key)
  positions.set(key, Math.max(0, Math.round(top)))
  if (positions.size > MAX_REMEMBERED) {
    const oldest = positions.keys().next().value
    if (oldest !== undefined) positions.delete(oldest)
  }
}

export function rememberedTabScroll(key: string): number {
  return positions.get(key) ?? 0
}
