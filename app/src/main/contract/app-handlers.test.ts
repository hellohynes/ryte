import { describe, expect, it, vi } from 'vitest'

import { createAppHandlers } from './app-handlers'

const ctx = { sender: {} as never }

describe('app handlers', () => {
  it('getVersion returns the injected version', async () => {
    const getVersion = vi.fn(() => '1.2.3')
    const handlers = createAppHandlers({ getVersion })

    await expect(handlers.getVersion(undefined, ctx)).resolves.toBe('1.2.3')
    expect(getVersion).toHaveBeenCalledTimes(1)
  })
})
