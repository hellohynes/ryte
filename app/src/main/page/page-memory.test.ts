import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPageMemory } from './page-memory'

const dirs: string[] = []
const fileOf = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'ryte-page-memory-'))
  dirs.push(dir)
  return join(dir, 'page-state.json')
}
afterEach(() => {
  vi.useRealTimers()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// A page that answers the capture question with a real reply. `on` runs its listener at once, as a load that
// has just finished would, unless `loaded` is false.
interface FakePage {
  isDestroyed: () => boolean
  isLoading: () => boolean
  on: ReturnType<typeof vi.fn>
  executeJavaScriptInIsolatedWorld: ReturnType<typeof vi.fn>
}
const page = (answer: unknown = null, { loading = false, loaded = true } = {}): FakePage => ({
  isDestroyed: () => false,
  isLoading: () => loading,
  on: vi.fn((_event: string, run: () => void) => {
    if (loaded) run()
  }),
  executeJavaScriptInIsolatedWorld: vi.fn().mockResolvedValue(answer)
})
// What was run in the page to put something back (the seed script that notes password inputs is not one).
const restores = (p: FakePage): unknown[] =>
  p.executeJavaScriptInIsolatedWorld.mock.calls.filter(([, [{ code }]]) =>
    (code as string).includes('secondPass')
  )
const live = (): boolean => true
const never = (): boolean => false

const typed = {
  path: '/p.html',
  scroll: { x: 0, y: 300 },
  areas: [],
  fields: [{ key: '#a', kind: 'textarea', value: 'typed' }]
}

describe('page memory', () => {
  it('keeps a captured state across a restart, for open tabs only', async () => {
    vi.useFakeTimers()
    const file = fileOf()
    const memory = createPageMemory(file)
    await memory.capture('page:one.html', page(typed) as never, live)
    await memory.capture('page:two.html', page(typed) as never, live)
    memory.retain('page:', ['page:one.html'])
    await memory.saveForQuit()
    const saved = JSON.parse(readFileSync(file, 'utf8')) as { entries: Record<string, unknown> }
    expect(Object.keys(saved.entries)).toEqual(['page:one.html'])

    // After a restart, the first load of the tab puts it back.
    const reopened = page()
    createPageMemory(file).track('page:one.html', reopened as never, live, never)
    expect(reopened.executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(1234, [
      { code: expect.stringContaining('"value":"typed"') }
    ])
  })

  it('notes the password inputs of every page that loads, with or without a state to put back', () => {
    const fresh = page()
    createPageMemory(fileOf()).track('page:new.html', fresh as never, live, never)
    expect(fresh.executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(1234, [
      { code: expect.stringContaining('MutationObserver') }
    ])
  })

  it('does not keep a state for a tab that is gone by the time the page answers', async () => {
    const memory = createPageMemory(fileOf())
    await memory.capture('page:gone.html', page(typed) as never, never)
    const probe = page()
    memory.track('page:gone.html', probe as never, live, never)
    expect(restores(probe)).toEqual([])
  })

  it('does not read a page that is still loading or waiting to be put back', async () => {
    const memory = createPageMemory(fileOf())
    await memory.capture('page:a.html', page(typed, { loading: true }) as never, live)
    const later = page()
    memory.track('page:a.html', later as never, live, never)
    expect(restores(later)).toEqual([])

    await memory.capture('page:b.html', page(typed) as never, live)
    memory.track('page:b.html', page(null, { loaded: false }) as never, live, never)
    const blank = page({ ...typed, scroll: { x: 0, y: 0 }, fields: [] })
    await memory.capture('page:b.html', blank as never, live)
    expect(blank.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled()
  })

  it('starts empty from a corrupt file and writes a valid one next', async () => {
    vi.useFakeTimers()
    const file = fileOf()
    writeFileSync(file, '{')
    const memory = createPageMemory(file)
    const probe = page()
    memory.track('page:x.html', probe as never, live, never)
    expect(restores(probe)).toEqual([])

    await memory.capture('page:x.html', page(typed) as never, live)
    await memory.saveForQuit()
    const saved = JSON.parse(readFileSync(file, 'utf8')) as { entries: Record<string, unknown> }
    expect(Object.keys(saved.entries)).toEqual(['page:x.html'])
  })
})
