import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBlockedLog } from './page-blocked'

describe('blocked log', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports once for a burst of refusals', () => {
    const onChange = vi.fn()
    const log = createBlockedLog(onChange)
    log.add('https://a.example/1')
    log.add('https://a.example/2')
    vi.advanceTimersByTime(100)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      count: 2,
      addresses: ['https://a.example/1', 'https://a.example/2']
    })
  })

  it('sends nothing for a page in the background, not even what was waiting when it left', () => {
    const onChange = vi.fn()
    const log = createBlockedLog(onChange)
    log.add('https://shown.example/before')
    log.pause()
    log.add('https://hidden.example/tracker')
    vi.advanceTimersByTime(1000)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('starts from nothing when the page comes back to the front', () => {
    const onChange = vi.fn()
    const log = createBlockedLog(onChange)
    log.add('https://shown.example/before')
    vi.advanceTimersByTime(100)
    log.pause()
    log.add('https://hidden.example/tracker')
    log.resume()
    log.add('https://shown.example/after')
    vi.advanceTimersByTime(100)
    expect(onChange).toHaveBeenLastCalledWith({
      count: 1,
      addresses: ['https://shown.example/after']
    })
  })
})
