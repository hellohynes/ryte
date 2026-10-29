import { describe, expect, it } from 'vitest'

import { addToast, DEFAULT_TOAST_MS, removeToast, type Toast } from './toast-store'

describe('toast queue', () => {
  it('defaults to a neutral toast that lasts five seconds', () => {
    const [toast] = addToast([], { message: 'Copied' }, 1)
    expect(toast).toMatchObject({ id: 1, tone: 'neutral', duration: DEFAULT_TOAST_MS })
  })

  it('keeps a toast until dismissed when duration is null', () => {
    expect(addToast([], { message: 'Saving', duration: null }, 1)[0]!.duration).toBeNull()
  })

  it('shows at most three, dropping the oldest', () => {
    let list: Toast[] = []
    for (const id of [1, 2, 3, 4]) list = addToast(list, { message: `m${id}` }, id)
    expect(list.map((toast) => toast.id)).toEqual([2, 3, 4])
  })

  it('removes one toast by id', () => {
    const list = addToast(addToast([], { message: 'a' }, 1), { message: 'b' }, 2)
    expect(removeToast(list, 1).map((toast) => toast.message)).toEqual(['b'])
    expect(removeToast(list, 9)).toHaveLength(2)
  })
})
