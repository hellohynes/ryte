export interface AnswerRenderSchedulerPlatform {
  requestAnimationFrame(callback: FrameRequestCallback): number
  cancelAnimationFrame(frame: number): void
}

export interface AnswerRenderScheduler {
  schedule(): void
  flush(): Promise<void>
  dispose(): void
}

/** Coalesce streaming answer renders to the browser's animation frame cadence. */
export function createAnswerRenderScheduler(
  getAnswer: () => string,
  renderAnswer: (answer: string) => void | Promise<void>,
  platform: AnswerRenderSchedulerPlatform = window
): AnswerRenderScheduler {
  let scheduledFrame: number | null = null
  let renderInFlight: Promise<void> | null = null
  let lastRenderedAnswer: string | null = null
  let isDirty = false
  let isDisposed = false

  function renderLatestAnswer(): Promise<void> {
    const answer = getAnswer()
    isDirty = false
    const completed = Promise.resolve()
      .then(() => {
        if (!isDisposed) return renderAnswer(answer)
      })
      .then(() => {
        lastRenderedAnswer = answer
      })
      .finally(() => {
        if (renderInFlight === completed) {
          renderInFlight = null
          if (isDirty && !isDisposed) scheduleFrame()
        }
      })
    renderInFlight = completed
    return completed
  }

  function scheduleFrame(): void {
    if (isDisposed || scheduledFrame !== null || renderInFlight) return
    scheduledFrame = platform.requestAnimationFrame(() => {
      scheduledFrame = null
      void renderLatestAnswer()
    })
  }

  function schedule(): void {
    if (isDisposed) return
    isDirty = true
    scheduleFrame()
  }

  async function flush(): Promise<void> {
    if (isDisposed) return
    if (scheduledFrame !== null) {
      platform.cancelAnimationFrame(scheduledFrame)
      scheduledFrame = null
    }
    await renderInFlight
    if (isDisposed) return
    if (scheduledFrame !== null) {
      platform.cancelAnimationFrame(scheduledFrame)
      scheduledFrame = null
    }
    if (!isDirty && lastRenderedAnswer === getAnswer()) return
    await renderLatestAnswer()
  }

  function dispose(): void {
    isDisposed = true
    if (scheduledFrame !== null) {
      platform.cancelAnimationFrame(scheduledFrame)
      scheduledFrame = null
    }
  }

  return { schedule, flush, dispose }
}
