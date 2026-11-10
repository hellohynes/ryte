import { describe, expect, it } from 'vitest'

import { prepareCodeView } from './code-view-model'

// Written by hand: JSON.stringify would normalize 1.0 and the long number.
const SQUASHED =
  '[' +
  Array.from(
    { length: 200 },
    (_, id) => `{"id":${id},"name":"item${id}","ratio":1.0,"big":12345678901234567890}`
  ).join(',') +
  ']'

// Laid out already, with one long value: not squashed, so it must stay as written.
const PRETTY_WITH_LONG_VALUE = JSON.stringify(
  { icon: 'a'.repeat(3000), items: Array.from({ length: 400 }, (_, id) => id) },
  null,
  4
)

describe('prepareCodeView', () => {
  it('shows JSON that is not valid as plain text with a notice, unchanged', () => {
    const text = '{ "a": 1, }'

    expect(prepareCodeView('json', text)).toEqual({ text, language: null, notice: 'invalid-json' })
  })

  it('lays out squashed JSON with a notice, keeping every value as written, and leaves laid-out JSON alone, even with one long value', () => {
    const view = prepareCodeView('json', SQUASHED)

    expect(view.language).toBe('json')
    expect(view.notice).toBe('formatted')
    expect(view.text).toContain('"ratio": 1.0')
    expect(view.text).toContain('"big": 12345678901234567890')
    expect(view.text.replace(/\s+/g, '')).toBe(SQUASHED)

    expect(prepareCodeView('json', view.text)).toEqual({
      text: view.text,
      language: 'json',
      notice: null
    })
    expect(prepareCodeView('json', PRETTY_WITH_LONG_VALUE)).toEqual({
      text: PRETTY_WITH_LONG_VALUE,
      language: 'json',
      notice: null
    })
  })

  it('never lays out a file that is not JSON', () => {
    const minified = `const a = "${'x'.repeat(3000)}";const b = [1,2,3];`

    expect(prepareCodeView('javascript', minified)).toEqual({
      text: minified,
      language: 'javascript',
      notice: null
    })
  })
})
