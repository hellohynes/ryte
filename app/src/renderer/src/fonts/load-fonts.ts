import { DEFAULT_FONT_ID, fontStacks, type FontId } from '../../../shared/fonts'
import { FONT_FACES } from './font-faces'

/** The quoted family names in a font stack, in order: "'Geist Variable', ui-sans-serif" -> ["Geist Variable"]. */
export function familiesIn(stack: string): string[] {
  return [...stack.matchAll(/'([^']+)'/g)].map((match) => match[1]!)
}

const loading = new Map<string, Promise<void>>()

/**
 * Registers a bundled family's faces with the document, once. Each face is a separate asset that
 * is only fetched here, so choosing a font costs one family and nothing else is read.
 */
export function ensureFontFamily(family: string): Promise<void> {
  const existing = loading.get(family)
  if (existing) return existing
  const sources = FONT_FACES[family]
  if (!sources || typeof FontFace === 'undefined') return Promise.resolve()

  const ready = Promise.all(
    sources.map(async (source) => {
      const face = new FontFace(family, `url(${await source.url()})`, {
        weight: source.weight,
        display: 'swap'
      })
      document.fonts.add(face)
      await face.load()
    })
  ).then(() => undefined)
  // A face that fails to load leaves the system fallback in the stack; try again on the next apply.
  ready.catch(() => loading.delete(family))
  loading.set(family, ready)
  return ready
}

/**
 * Makes the chosen font the content font: its stacks go to CSS variables that notes, summaries and
 * code read, and the bundled families in them are loaded. The interface stays in Geist whatever is
 * chosen, so Geist is always loaded too.
 */
export async function applyFont(id: FontId = DEFAULT_FONT_ID): Promise<void> {
  const { sans, mono } = fontStacks(id)
  const root = document.documentElement.style
  root.setProperty('--st-font-sans', sans)
  root.setProperty('--st-font-mono', mono)
  const ui = fontStacks(DEFAULT_FONT_ID)
  const families = new Set([
    ...familiesIn(sans),
    ...familiesIn(mono),
    ...familiesIn(ui.sans),
    ...familiesIn(ui.mono)
  ])
  await Promise.all([...families].map(ensureFontFamily)).catch(() => undefined)
}
