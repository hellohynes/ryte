import { describe, expect, it } from 'vitest'

import { createSaveQueue } from './save-queue'

describe('save queue', () => {
  it('runs saves one at a time, in the order they were asked for', async () => {
    const queue = createSaveQueue()
    const events: string[] = []
    const slow = queue.run(async () => {
      events.push('first:start')
      await new Promise((resolve) => setTimeout(resolve, 20))
      events.push('first:end')
    })
    const quick = queue.run(async () => {
      events.push('second:start')
    })

    await Promise.all([slow, quick])

    expect(events).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('gives each caller its own result, and a failure does not stop the saves behind it', async () => {
    const queue = createSaveQueue()
    const failed = queue.run(async () => {
      throw new Error('keychain unavailable')
    })
    const after = queue.run(async () => 'saved')

    await expect(failed).rejects.toThrow('keychain unavailable')
    await expect(after).resolves.toBe('saved')
  })
})
