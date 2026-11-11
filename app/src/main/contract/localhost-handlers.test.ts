import { describe, expect, it, vi } from 'vitest'

import type { Approvals } from '../localhost/approvals'
import type { LocalBox } from '../page/local-box'
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

const box = {} as LocalBox
const openAddressTab = vi.fn(() => ({ tabs: [] }) as never)

describe('localhost handlers', () => {
  it('refuses an address that is not local and saves nothing', async () => {
    const approvals = fakeApprovals()
    const handlers = createLocalhostHandlers({
      approvals,
      box,
      openAddressTab,
      openInBrowser: () => true
    })
    for (const url of ['http://example.com', 'http://0.0.0.0:5173', 'file:///etc/hosts']) {
      expect(await handlers.open({ url, choice: 'always' }, ctx)).toEqual({ status: 'refused' })
    }
    expect(approvals.saved).toEqual([])
  })

  it('saves an always choice but not an once choice', async () => {
    const approvals = fakeApprovals()
    const handlers = createLocalhostHandlers({
      approvals,
      box,
      openAddressTab,
      openInBrowser: () => true
    })
    await handlers.open({ url: 'http://localhost:3000', choice: 'once' }, ctx)
    expect(approvals.saved).toEqual([])
    await handlers.open({ url: 'http://localhost:5173/x', choice: 'always' }, ctx)
    expect(openAddressTab).toHaveBeenLastCalledWith('http://localhost:5173/x')
    expect(approvals.saved).toEqual(['http://localhost:5173'])
  })

  it('stops showing an origin once its approval is removed or its once choice is released', async () => {
    const show = vi.fn(async () => 'shown' as const)
    const closeOrigin = vi.fn()
    const approvals = fakeApprovals()
    const handlers = createLocalhostHandlers({
      approvals,
      box: { show, closeOrigin } as unknown as LocalBox,
      openAddressTab,
      openInBrowser: () => true
    })
    const bounds = { x: 0, y: 0, width: 100, height: 100 }
    const showUrl = async (url: string): Promise<unknown> => handlers.show({ url, bounds }, ctx)

    await handlers.open({ url: 'http://localhost:5173/', choice: 'always' }, ctx)
    expect(await showUrl('http://localhost:5173/')).toEqual({ status: 'shown' })
    await handlers.removeApproval({ origin: 'http://localhost:5173' }, ctx)
    expect(await showUrl('http://localhost:5173/')).toEqual({ status: 'needs-approval' })

    await handlers.open({ url: 'http://localhost:3000/', choice: 'once' }, ctx)
    expect(await showUrl('http://localhost:3000/')).toEqual({ status: 'shown' })
    await handlers.release({ url: 'http://localhost:3000/' }, ctx)
    expect(await showUrl('http://localhost:3000/')).toEqual({ status: 'needs-approval' })
  })
})
