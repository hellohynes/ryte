import { describe, expect, it, vi } from 'vitest'

import { createPageLinkOpener, createRealInputGate, REAL_INPUT_WINDOW_MS } from './page-links'

describe('the page link opener', () => {
  const setup = (): {
    gate: ReturnType<typeof createRealInputGate>
    openExternal: ReturnType<typeof vi.fn<(url: string) => void>>
    open: (url: string) => boolean
    advance: (ms: number) => void
  } => {
    let time = 10_000
    const gate = createRealInputGate(() => time)
    const openExternal = vi.fn<(url: string) => void>()
    return {
      gate,
      openExternal,
      open: createPageLinkOpener(gate, openExternal),
      advance: (ms: number) => void (time += ms)
    }
  }

  it('opens an https link once after a real click', () => {
    const { gate, open, openExternal } = setup()
    gate.note()
    expect(open('https://example.com/a')).toBe(true)
    expect(openExternal).toHaveBeenCalledTimes(1)
    expect(openExternal).toHaveBeenCalledWith('https://example.com/a')
  })

  it('opens nothing without a recent real click', () => {
    const { gate, open, openExternal, advance } = setup()
    expect(open('https://example.com/a')).toBe(false)
    gate.note()
    advance(REAL_INPUT_WINDOW_MS + 1)
    expect(open('https://example.com/a')).toBe(false)
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('refuses a second open from the same click', () => {
    const { gate, open, openExternal } = setup()
    gate.note()
    expect(open('https://example.com/one')).toBe(true)
    expect(open('https://example.com/two')).toBe(false)
    expect(openExternal).toHaveBeenCalledTimes(1)
  })

  it('refuses file, javascript, data and custom schemes even with a real click, and keeps the click for a good link', () => {
    const { gate, open, openExternal } = setup()
    gate.note()
    for (const url of [
      'file:///etc/hosts',
      'javascript:alert(1)',
      'data:text/html,hi',
      'ryte-file://notes/secret.md',
      'blob:ryte-page://x/y',
      'not a url'
    ]) {
      expect(open(url), url).toBe(false)
    }
    expect(openExternal).not.toHaveBeenCalled()
    expect(open('mailto:a@example.com')).toBe(true)
  })
})
