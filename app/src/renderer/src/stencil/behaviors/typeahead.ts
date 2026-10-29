/**
 * Type-to-jump in a list (menu, select, listbox). `typeaheadStep` keeps the typed buffer;
 * `typeaheadMatch` finds the item. Pure, so both run in node tests.
 */
export interface TypeaheadState {
  buffer: string
  at: number
}

export const TYPEAHEAD_RESET_MS = 500

/** True for a key that adds to the buffer: one printable character, with no command modifier. */
export function isTypeaheadKey(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>
): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
}

export function typeaheadStep(
  state: TypeaheadState,
  key: string,
  now: number,
  timeout = TYPEAHEAD_RESET_MS
): TypeaheadState {
  const fresh = now - state.at > timeout
  // A space only counts once something has been typed; before that it is not a search.
  if (key === ' ' && (fresh || state.buffer === '')) return state
  return { buffer: (fresh ? '' : state.buffer) + key.toLowerCase(), at: now }
}

/**
 * The next label starting with the buffer, searching on from `current`. Typing one letter again and
 * again steps through the items that start with it.
 */
export function typeaheadMatch(labels: string[], buffer: string, current: number): number | null {
  if (labels.length === 0 || buffer === '') return null
  const repeated = buffer.length > 1 && [...buffer].every((char) => char === buffer[0])
  const needle = repeated ? buffer[0]! : buffer
  const start = repeated || buffer.length === 1 ? current + 1 : Math.max(current, 0)
  for (let step = 0; step < labels.length; step++) {
    const index = (start + step) % labels.length
    if (labels[index]!.toLowerCase().startsWith(needle)) return index
  }
  return null
}

export interface TypeaheadResult {
  /** The key went into the search buffer, so it should not also act as a key press (a space). */
  consumed: boolean
  /** The index to move to, or null when nothing matches. */
  index: number | null
}

export interface Typeahead {
  onKeydown(event: KeyboardEvent): TypeaheadResult
}

export function useTypeahead(labels: () => string[], current: () => number): Typeahead {
  let state: TypeaheadState = { buffer: '', at: 0 }
  return {
    onKeydown(event) {
      if (!isTypeaheadKey(event)) return { consumed: false, index: null }
      const next = typeaheadStep(state, event.key, event.timeStamp || Date.now())
      if (next === state) return { consumed: false, index: null }
      state = next
      return { consumed: true, index: typeaheadMatch(labels(), state.buffer, current()) }
    }
  }
}
