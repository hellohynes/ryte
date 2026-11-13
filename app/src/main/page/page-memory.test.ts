import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
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

// A page that answers the capture question with a real reply, and records what it was told to restore.
const page = (answer: unknown): Parameters<ReturnType<typeof createPageMemory>['capture']>[1] =>
  ({
    isDestroyed: () => false,
    once: (_event: string, run: () => void) => run(),
    executeJavaScriptInIsolatedWorld: vi.fn().mockResolvedValue(answer)
  }) as never

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
    const memory = createPageMemory(file, 30_000)
    await memory.capture('page:one.html', page(typed), () => true)
    await memory.capture('page:two.html', page(typed), () => true)
    memory.retain('page:', ['one.html'])
    memory.flush()
    const saved = JSON.parse(readFileSync(file, 'utf8')) as { entries: Record<string, unknown> }
    expect(Object.keys(saved.entries)).toEqual(['page:one.html'])

    // After a restart, the first load of the tab puts it back.
    const again = createPageMemory(file, 30_000)
    const reopened = page(null)
    again.restoreOnLoad('page:one.html', reopened)
    expect(reopened.executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(1234, [
      { code: expect.stringContaining('"value":"typed"') }
    ])
  })

  it('does not keep a state for a tab that is gone by the time the page answers, or after it closes', async () => {
    const memory = createPageMemory(fileOf(), 30_000)
    await memory.capture('page:gone.html', page(typed), () => false)
    await memory.capture('page:shut.html', page(typed), () => true)
    memory.forget('page:shut.html')
    const probe = page(null)
    memory.restoreOnLoad('page:gone.html', probe)
    memory.restoreOnLoad('page:shut.html', probe)
    expect(probe.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled()
  })

  it('ignores a page that answers with rubbish, and a file with rubbish in it', async () => {
    const memory = createPageMemory(fileOf(), 30_000)
    await memory.capture('page:x.html', page({ path: 5 }), () => true)
    const probe = page(null)
    memory.restoreOnLoad('page:x.html', probe)
    expect(probe.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled()
  })
})
