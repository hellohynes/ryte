import { EventEmitter } from 'node:events'

import { describe, expect, it } from 'vitest'

import { recentRealInput, watchRealInput } from './real-input'

function windowContents(): { contents: never; input: (type: string, event: object) => void } {
  const emitter = new EventEmitter()
  return {
    contents: emitter as never,
    input: (type, event) => emitter.emit(type, {}, event)
  }
}

describe('real input in a window', () => {
  it('counts a mouse-up once, and nothing else it did not see', () => {
    const { contents, input } = windowContents()
    watchRealInput(contents)
    expect(recentRealInput(contents)).toBe(false)
    input('input-event', { type: 'mouseDown' })
    expect(recentRealInput(contents)).toBe(false)
    input('input-event', { type: 'mouseUp' })
    expect(recentRealInput(contents)).toBe(true)
    expect(recentRealInput(contents)).toBe(false)
  })

  it('counts Enter and Space, not a held key or any other key', () => {
    const { contents, input } = windowContents()
    watchRealInput(contents)
    for (const event of [
      { type: 'keyDown', key: 'Enter', isAutoRepeat: true },
      { type: 'keyDown', key: 'a' },
      { type: 'keyUp', key: 'Enter' }
    ]) {
      input('input-event', event)
      expect(recentRealInput(contents)).toBe(false)
    }
    for (const event of [
      { type: 'keyDown', key: 'Enter' },
      { type: 'keyUp', key: ' ' }
    ]) {
      input('input-event', event)
      expect(recentRealInput(contents)).toBe(true)
    }
  })

  it('knows nothing of a window it does not watch', () => {
    expect(recentRealInput(windowContents().contents)).toBe(false)
  })
})
