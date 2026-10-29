import type { SearchStatus } from '../stores/search'

export type PresentationPhase = 'idle' | 'thinking' | 'answering' | 'settled'

export interface PresentationInput {
  status: SearchStatus
  /** Length of the answer text received so far (not what is shown). */
  answerLength: number
  /** Thinking lines that exist so far. */
  lineCount: number
  /** Everything the provider sent has been typed out (decided by the section typing plan). */
  typingDone: boolean
}

export interface PresentationState {
  phase: PresentationPhase
  /** How many thinking lines are on screen. */
  revealedLines: number
  /** How long the thinking lasted, once it has finished. */
  thoughtMs: number | null
}

// Time between thinking lines while the search is still running, so each step can be read.
const LINE_GAP_MS = 700
// Once the run is over, the remaining lines play faster but are still shown.
const FINISHED_LINE_GAP_MS = 260
// The last thinking line stays on its own for a moment before the text starts.
const TYPE_BEAT_MS = 500
// A short pause once the last word is typed, before the box folds away.
const SETTLE_BEAT_MS = 700

function initialState(): PresentationState {
  return { phase: 'idle', revealedLines: 0, thoughtMs: null }
}

/**
 * The sequence of a search as the reader sees it: thinking lines appear one at a time, the
 * thinking folds, then the answer is typed at a steady pace. It is a plain state machine with time
 * passed in, so the order never depends on how fast the provider's tokens happen to arrive.
 */
export function createPresentationEngine(): {
  state: PresentationState
  start: (now: number) => PresentationState
  tick: (input: PresentationInput, now: number) => PresentationState
  settle: (lineCount: number) => PresentationState
  reset: () => PresentationState
} {
  let state = initialState()
  let startedAt = 0
  let lastLineAt = 0
  let settleAt: number | null = null

  const engine = {
    get state(): PresentationState {
      return state
    },

    start(now: number): PresentationState {
      state = { ...initialState(), phase: 'thinking' }
      startedAt = now
      lastLineAt = Number.NEGATIVE_INFINITY
      settleAt = null
      return state
    },

    tick(input: PresentationInput, now: number): PresentationState {
      const finished = input.status === 'done' || input.status === 'error'

      if (state.phase === 'thinking') {
        // No summary is coming: there is nothing to build up to, so results show immediately.
        if (finished && input.answerLength === 0) {
          state = {
            phase: 'settled',
            revealedLines: input.lineCount,
            thoughtMs: now - startedAt
          }
          return state
        }

        const gap = finished ? FINISHED_LINE_GAP_MS : LINE_GAP_MS
        let revealedLines = state.revealedLines
        if (revealedLines < input.lineCount && now - lastLineAt >= gap) {
          revealedLines += 1
          lastLineAt = now
        }

        const caughtUp = revealedLines >= input.lineCount
        const readyToType =
          caughtUp && (input.answerLength > 0 || finished) && now - lastLineAt >= TYPE_BEAT_MS
        state = { ...state, phase: readyToType ? 'answering' : 'thinking', revealedLines }
        return state
      }

      if (state.phase === 'answering') {
        if (!(finished && input.typingDone)) {
          settleAt = null
          return state
        }
        settleAt ??= now + SETTLE_BEAT_MS
        if (now >= settleAt) state = { ...state, phase: 'settled', thoughtMs: now - startedAt }
      }
      return state
    },

    settle(lineCount: number): PresentationState {
      state = { phase: 'settled', revealedLines: lineCount, thoughtMs: null }
      return state
    },

    reset(): PresentationState {
      state = initialState()
      settleAt = null
      return state
    }
  }
  return engine
}
