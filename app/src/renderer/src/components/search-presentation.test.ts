import { describe, expect, it } from 'vitest'

import { createPresentationEngine, type PresentationInput } from './search-presentation'

function input(overrides: Partial<PresentationInput> = {}): PresentationInput {
  return { status: 'searching', answerLength: 0, lineCount: 1, typingDone: false, ...overrides }
}

describe('presentation engine', () => {
  it('reveals the first thinking line at once, then one line at a time', () => {
    const engine = createPresentationEngine()
    engine.start(0)

    expect(engine.tick(input({ lineCount: 4 }), 0).revealedLines).toBe(1)
    expect(engine.tick(input({ lineCount: 4 }), 300).revealedLines).toBe(1)
    expect(engine.tick(input({ lineCount: 4 }), 750).revealedLines).toBe(2)
    expect(engine.tick(input({ lineCount: 4 }), 900).revealedLines).toBe(2)
    expect(engine.tick(input({ lineCount: 4 }), 1500).revealedLines).toBe(3)
  })

  it('never reveals a line that has not happened yet', () => {
    const engine = createPresentationEngine()
    engine.start(0)
    expect(engine.tick(input({ lineCount: 1 }), 5_000).revealedLines).toBe(1)
  })

  it('keeps thinking while the provider has not started writing', () => {
    const engine = createPresentationEngine()
    engine.start(0)
    for (let now = 0; now <= 6_000; now += 100) {
      expect(engine.tick(input({ lineCount: 2, answerLength: 0 }), now).phase).toBe('thinking')
    }
  })

  it('holds the answer back until every thinking line has been shown', () => {
    const engine = createPresentationEngine()
    engine.start(0)
    // Text is already streaming in, but three lines still have to play out.
    expect(engine.tick(input({ lineCount: 3, answerLength: 400 }), 0).phase).toBe('thinking')
    expect(engine.tick(input({ lineCount: 3, answerLength: 400 }), 750).phase).toBe('thinking')
    // The last line has appeared; it gets a beat of its own before the text starts.
    expect(engine.tick(input({ lineCount: 3, answerLength: 400 }), 1500).phase).toBe('thinking')
    expect(engine.tick(input({ lineCount: 3, answerLength: 400 }), 2100).phase).toBe('answering')
  })

  it('moves from the last thinking line into writing, with the box still working', () => {
    const engine = createPresentationEngine()
    engine.start(1_000)
    engine.tick(input({ lineCount: 1, answerLength: 50 }), 1_000)
    const answering = engine.tick(input({ lineCount: 1, answerLength: 50 }), 1_600)
    expect(answering).toMatchObject({ phase: 'answering', thoughtMs: null })
  })

  it('stays in writing until the provider has finished and everything is typed', () => {
    const engine = createPresentationEngine()
    engine.start(0)
    engine.tick(input({ lineCount: 1, answerLength: 300 }), 0)
    engine.tick(input({ lineCount: 1, answerLength: 300 }), 600)

    // Typed everything so far, but the provider is still sending.
    expect(engine.tick(input({ typingDone: true, answerLength: 300 }), 10_000).phase).toBe(
      'answering'
    )
    // Finished, but sections are still typing.
    expect(engine.tick(input({ status: 'done', answerLength: 300 }), 20_000).phase).toBe(
      'answering'
    )
  })

  it('settles a beat after the last word is typed, recording the total time', () => {
    const engine = createPresentationEngine()
    engine.start(0)
    engine.tick(input({ lineCount: 1, answerLength: 300 }), 0)
    engine.tick(input({ lineCount: 1, answerLength: 300 }), 600)

    const done = input({ status: 'done', typingDone: true, answerLength: 300 })
    expect(engine.tick(done, 9_000).phase).toBe('answering')
    expect(engine.tick(done, 9_800)).toMatchObject({ phase: 'settled', thoughtMs: 9_800 })
  })

  it('finishes a run with no answer (local only) at once, showing every line it had', () => {
    const engine = createPresentationEngine()
    engine.start(0)
    engine.tick(input({ lineCount: 2 }), 100)
    const state = engine.tick(input({ status: 'done', lineCount: 4, answerLength: 0 }), 400)
    expect(state).toMatchObject({ phase: 'settled', revealedLines: 4, thoughtMs: 400 })
  })

  it('also settles at once when a run fails before any text arrives', () => {
    const engine = createPresentationEngine()
    engine.start(0)
    const state = engine.tick(input({ status: 'error', lineCount: 3, answerLength: 0 }), 300)
    expect(state.phase).toBe('settled')
  })

  it('speeds the remaining thinking up once the run has finished', () => {
    const slow = createPresentationEngine()
    slow.start(0)
    slow.tick(input({ lineCount: 4 }), 0)
    const running = slow.tick(input({ lineCount: 4 }), 400)

    const fast = createPresentationEngine()
    fast.start(0)
    fast.tick(input({ status: 'done', lineCount: 4, answerLength: 100 }), 0)
    const finished = fast.tick(input({ status: 'done', lineCount: 4, answerLength: 100 }), 400)

    expect(running.revealedLines).toBe(1)
    expect(finished.revealedLines).toBeGreaterThan(1)
  })

  it('shows a restored summary at once, with nothing to replay', () => {
    const engine = createPresentationEngine()
    expect(engine.settle(3)).toMatchObject({ phase: 'settled', revealedLines: 3 })
  })

  it('returns to idle on reset', () => {
    const engine = createPresentationEngine()
    engine.start(0)
    engine.tick(input({ lineCount: 2 }), 0)
    expect(engine.reset()).toMatchObject({ phase: 'idle', revealedLines: 0 })
  })
})
