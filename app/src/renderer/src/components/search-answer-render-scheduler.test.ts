import { describe, expect, it, vi } from 'vitest'

import { createAnswerRenderScheduler } from './search-answer-render-scheduler'

describe('createAnswerRenderScheduler', () => {
  it('coalesces a token burst into one animation-frame render using the latest answer', async () => {
    let nextFrame = 0
    const frameCallbacks = new Map<number, FrameRequestCallback>()
    const render = vi.fn()
    let answer = ''
    const scheduler = createAnswerRenderScheduler(() => answer, render, {
      requestAnimationFrame: (callback) => {
        nextFrame += 1
        frameCallbacks.set(nextFrame, callback)
        return nextFrame
      },
      cancelAnimationFrame: (frame) => frameCallbacks.delete(frame)
    })

    answer += 'first '
    scheduler.schedule()
    answer += 'second '
    scheduler.schedule()
    answer += 'third'
    scheduler.schedule()

    expect(frameCallbacks).toHaveLength(1)
    frameCallbacks.get(1)?.(0)
    await Promise.resolve()

    expect(render).toHaveBeenCalledOnce()
    expect(render).toHaveBeenLastCalledWith('first second third')
  })

  it('flushes the final answer immediately and cancels the pending animation frame', async () => {
    let nextFrame = 0
    const frameCallbacks = new Map<number, FrameRequestCallback>()
    const render = vi.fn()
    let answer = 'initial'
    const scheduler = createAnswerRenderScheduler(() => answer, render, {
      requestAnimationFrame: (callback) => {
        nextFrame += 1
        frameCallbacks.set(nextFrame, callback)
        return nextFrame
      },
      cancelAnimationFrame: (frame) => frameCallbacks.delete(frame)
    })

    scheduler.schedule()
    answer = 'complete answer'
    await scheduler.flush()

    expect(render).toHaveBeenCalledOnce()
    expect(render).toHaveBeenLastCalledWith('complete answer')
    expect(frameCallbacks).toHaveLength(0)
  })

  it('cancels pending work when the overlay unmounts', async () => {
    let nextFrame = 0
    const frameCallbacks = new Map<number, FrameRequestCallback>()
    const render = vi.fn()
    const scheduler = createAnswerRenderScheduler(() => 'pending', render, {
      requestAnimationFrame: (callback) => {
        nextFrame += 1
        frameCallbacks.set(nextFrame, callback)
        return nextFrame
      },
      cancelAnimationFrame: (frame) => frameCallbacks.delete(frame)
    })

    scheduler.schedule()
    scheduler.dispose()
    frameCallbacks.get(1)?.(0)
    await Promise.resolve()

    expect(frameCallbacks).toHaveLength(0)
    expect(render).not.toHaveBeenCalled()
  })

  it('does not queue more full renders while one render is still running', async () => {
    let nextFrame = 0
    const frameCallbacks = new Map<number, FrameRequestCallback>()
    let completeRender: (() => void) | undefined
    const render = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          completeRender = resolve
        })
    )
    let answer = 'first'
    const scheduler = createAnswerRenderScheduler(() => answer, render, {
      requestAnimationFrame: (callback) => {
        nextFrame += 1
        frameCallbacks.set(nextFrame, callback)
        return nextFrame
      },
      cancelAnimationFrame: (frame) => frameCallbacks.delete(frame)
    })

    scheduler.schedule()
    frameCallbacks.get(1)?.(0)
    await Promise.resolve()
    answer = 'latest'
    scheduler.schedule()

    expect(render).toHaveBeenCalledOnce()
    expect(frameCallbacks).toHaveLength(1)

    completeRender?.()
    await vi.waitFor(() => expect(frameCallbacks.has(2)).toBe(true))
    frameCallbacks.get(2)?.(0)
    await Promise.resolve()

    expect(render).toHaveBeenCalledTimes(2)
    expect(render).toHaveBeenLastCalledWith('latest')
  })
})
