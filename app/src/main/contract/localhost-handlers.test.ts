import { describe, expect, it } from 'vitest'

import type { Approvals } from '../localhost/approvals'
import { createLocalhostHandlers } from './localhost-handlers'

const ctx = { sender: {} as never }

function fakeApprovals(): Approvals & { saved: string[] } {
  const saved: string[] = []
  return {
    saved,
    list: () => [...saved],
    has: (origin) => saved.includes(origin),
    add: (origin) => void saved.push(origin),
    remove: (origin) => void saved.splice(saved.indexOf(origin), 1)
  }
}

describe('localhost handlers', () => {
  it('refuses an address that is not local and saves nothing', async () => {
    const approvals = fakeApprovals()
    const handlers = createLocalhostHandlers({ approvals })
    for (const url of ['http://example.com', 'http://0.0.0.0:5173', 'file:///etc/hosts']) {
      expect(await handlers.open({ url, choice: 'always' }, ctx)).toEqual({ status: 'refused' })
    }
    expect(approvals.saved).toEqual([])
  })

  it('saves an always choice but not an once choice', async () => {
    const approvals = fakeApprovals()
    const handlers = createLocalhostHandlers({ approvals })
    await handlers.open({ url: 'http://localhost:3000', choice: 'once' }, ctx)
    expect(approvals.saved).toEqual([])
    const result = await handlers.open({ url: 'http://localhost:5173/x', choice: 'always' }, ctx)
    expect(result).toEqual({
      status: 'ok',
      url: 'http://localhost:5173/x',
      origin: 'http://localhost:5173'
    })
    expect(approvals.saved).toEqual(['http://localhost:5173'])
  })

  it('removes an approval', async () => {
    const approvals = fakeApprovals()
    const handlers = createLocalhostHandlers({ approvals })
    await handlers.open({ url: 'http://localhost:5173', choice: 'always' }, ctx)
    expect(await handlers.removeApproval({ origin: 'http://localhost:5173' }, ctx)).toEqual([])
  })
})
