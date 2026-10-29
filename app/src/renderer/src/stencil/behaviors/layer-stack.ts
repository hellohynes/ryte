/**
 * The open layers of the app, in the order they opened. Escape and outside clicks close only the top
 * one, so a menu inside a dialog closes before the dialog does. Pure, so it runs in node tests.
 */
export interface LayerStack {
  push(id: symbol): void
  remove(id: symbol): void
  isTop(id: symbol): boolean
  readonly size: number
}

export function createLayerStack(): LayerStack {
  const ids: symbol[] = []
  return {
    push(id) {
      if (!ids.includes(id)) ids.push(id)
    },
    remove(id) {
      const at = ids.indexOf(id)
      if (at !== -1) ids.splice(at, 1)
    },
    isTop: (id) => ids.at(-1) === id,
    get size() {
      return ids.length
    }
  }
}

/** The one stack the whole renderer shares. */
export const layers = createLayerStack()
