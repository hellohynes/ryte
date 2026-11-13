import { describe, expect, it, vi } from 'vitest'

import { createKeptViews, type KeptViews } from './kept-views'

const bounds = { x: 0, y: 0, width: 10, height: 10 }

interface TestItem {
  name: string
  view: {
    setBounds: () => void
    setVisible: (visible: boolean) => void
    webContents: {
      setAudioMuted: (muted: boolean) => void
      isDestroyed: () => boolean
      getOSProcessId: () => number
    }
  }
  log: { pause: () => void; resume: () => void }
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
    view: {
      setBounds: vi.fn(),
      setVisible: vi.fn(),
      webContents: { setAudioMuted: vi.fn(), isDestroyed: () => false, getOSProcessId: () => 0 }
    },
    log: { pause: vi.fn(), resume: vi.fn() }
  })
  return { kept, destroyed, make }
}

describe('kept views', () => {
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

  it('silences a view in the background: no sound, no reports to the page in front', () => {
    const { kept, make } = setup()
    const a = make('a')
    const b = make('b')
    kept.add(1, 'a', a)
    kept.add(1, 'b', b)
    kept.present(1, 'a', bounds)
    kept.present(1, 'b', bounds)
    // "a" was hidden by "b" taking the stage.
    expect(a.log.pause).toHaveBeenCalled()
    expect(a.view.webContents.setAudioMuted).toHaveBeenLastCalledWith(true)
    expect(b.log.resume).toHaveBeenCalled()
    expect(b.view.webContents.setAudioMuted).toHaveBeenLastCalledWith(false)
    kept.park(1, 'b')
    expect(b.log.pause).toHaveBeenCalled()
    expect(b.view.webContents.setAudioMuted).toHaveBeenLastCalledWith(true)
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
