import { describe, expect, it, vi } from 'vitest'

import { createKeptViews, MAX_KEPT_VIEWS, type KeptViews } from './kept-views'

const bounds = { x: 0, y: 0, width: 10, height: 10 }

interface TestItem {
  name: string
  view: { setBounds: () => void; setVisible: (visible: boolean) => void }
}

function setup(): {
  kept: KeptViews<TestItem>
  destroyed: string[]
  make: (name: string) => TestItem
} {
  const destroyed: string[] = []
  const kept = createKeptViews<TestItem>({ destroy: (item) => destroyed.push(item.name) })
  const make = (name: string): TestItem => ({
    name,
    view: { setBounds: vi.fn(), setVisible: vi.fn() }
  })
  return { kept, destroyed, make }
}

describe('kept views', () => {
  it('keeps up to the cap and destroys the view shown longest ago beyond it', () => {
    const { kept, destroyed, make } = setup()
    const names = ['a', 'b', 'c', 'd', 'e']
    expect(MAX_KEPT_VIEWS).toBe(4)
    for (const name of names.slice(0, 4)) {
      kept.add(1, name, make(name))
      kept.present(1, name, bounds)
    }
    // Showing "a" again makes "b" the one shown longest ago.
    kept.present(1, 'a', bounds)
    kept.add(1, 'e', make('e'))
    kept.present(1, 'e', bounds)
    expect(destroyed).toEqual(['b'])
    expect(kept.size(1)).toBe(4)
  })

  it('hides a view when its tab goes to the background without destroying it', () => {
    const { kept, destroyed, make } = setup()
    const a = make('a')
    kept.add(1, 'a', a)
    kept.present(1, 'a', bounds)
    kept.park(1, 'a')
    expect(a.view.setVisible).toHaveBeenLastCalledWith(false)
    expect(destroyed).toEqual([])
    expect(kept.shown(1)).toBeUndefined()
    expect(kept.get(1, 'a')).toBe(a)
  })

  it('shows one view at a time', () => {
    const { kept, make } = setup()
    const a = make('a')
    const b = make('b')
    kept.add(1, 'a', a)
    kept.add(1, 'b', b)
    kept.present(1, 'a', bounds)
    kept.present(1, 'b', bounds)
    expect(a.view.setVisible).toHaveBeenLastCalledWith(false)
    expect(kept.shown(1)).toBe(b)
  })

  it('destroys a view when its tab closes', () => {
    const { kept, destroyed, make } = setup()
    kept.add(1, 'a', make('a'))
    kept.remove(1, 'a')
    expect(destroyed).toEqual(['a'])
    expect(kept.get(1, 'a')).toBeUndefined()
  })

  it('destroys the views of tabs that are no longer open, and ignores a page that has no tab', () => {
    const { kept, destroyed, make } = setup()
    kept.add(1, 'a', make('a'))
    kept.add(1, 'b', make('b'))
    kept.retain(1, ['b'])
    expect(destroyed).toEqual(['a'])
    expect(kept.isWanted(1, 'a')).toBe(false)
    expect(kept.isWanted(1, 'b')).toBe(true)
  })

  it('destroys every view of an origin in any window, and every view of a closed window', () => {
    const { kept, destroyed, make } = setup()
    kept.add(1, 'a', make('a'))
    kept.add(2, 'b', make('b'))
    kept.add(2, 'c', make('c'))
    kept.removeWhere((item) => item.name !== 'c')
    expect(destroyed.sort()).toEqual(['a', 'b'])
    kept.dropWindow(2)
    expect(destroyed.sort()).toEqual(['a', 'b', 'c'])
  })

  it('keeps each window separate', () => {
    const { kept, destroyed, make } = setup()
    kept.add(1, 'a', make('a'))
    kept.add(2, 'a', make('a2'))
    kept.retain(1, [])
    expect(destroyed).toEqual(['a'])
    expect(kept.get(2, 'a')?.name).toBe('a2')
  })
})
