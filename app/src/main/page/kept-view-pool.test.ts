import { describe, expect, it, vi } from 'vitest'

import { createKeptViewPool } from './kept-view-pool'
import { createKeptViews } from './kept-views'

const MB = 1024 * 1024
interface Item {
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
const bounds = { x: 0, y: 0, width: 10, height: 10 }

const make = (name: string, pid: number): Item => ({
  name,
  view: {
    setBounds: vi.fn(),
    setVisible: vi.fn(),
    webContents: { setAudioMuted: vi.fn(), isDestroyed: () => false, getOSProcessId: () => pid }
  },
  log: { pause: vi.fn(), resume: vi.fn() }
})

describe('one pool for two boxes', () => {
  it('counts both boxes against one budget and sleeps the view shown longest ago, in either box', () => {
    const memory = [
      { pid: 1, memory: { workingSetSize: 700 * 1024 } },
      { pid: 2, memory: { workingSetSize: 700 * 1024 } },
      { pid: 3, memory: { workingSetSize: 700 * 1024 } }
    ]
    const pool = createKeptViewPool({ metrics: () => memory, budgetBytes: 1536 * MB })
    const destroyed: string[] = []
    const pages = createKeptViews<Item>({ pool, destroy: (i) => destroyed.push(i.name) })
    const locals = createKeptViews<Item>({ pool, destroy: (i) => destroyed.push(i.name) })

    // Each box alone is within 1536 MB; together the three views are not.
    pages.add(1, 'page-a', make('page-a', 1))
    pages.present(1, 'page-a', bounds)
    pages.park(1, 'page-a')
    locals.add(1, 'local-b', make('local-b', 2))
    locals.present(1, 'local-b', bounds)
    locals.park(1, 'local-b')
    expect(destroyed).toEqual([])
    pages.add(1, 'page-c', make('page-c', 3))
    pages.present(1, 'page-c', bounds)
    expect(destroyed).toEqual(['page-a'])
    expect(locals.get(1, 'local-b')).toBeDefined()
  })

  it('counts a process shared by views of both boxes once', () => {
    const pool = createKeptViewPool({
      metrics: () => [{ pid: 7, memory: { workingSetSize: 1000 * 1024 } }],
      budgetBytes: 1536 * MB
    })
    const destroyed: string[] = []
    const pages = createKeptViews<Item>({ pool, destroy: (i) => destroyed.push(i.name) })
    const locals = createKeptViews<Item>({ pool, destroy: (i) => destroyed.push(i.name) })
    pages.add(1, 'a', make('a', 7))
    locals.add(1, 'b', make('b', 7))
    locals.add(1, 'c', make('c', 7))
    expect(destroyed).toEqual([])
  })
})
