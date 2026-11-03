import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EmbeddingBackfill, RETRY_DELAYS_MS, fileMtimeReader } from './embedding-backfill'
import type { EmbeddingProvider } from './embedder'

interface FakeNote {
  mtimeMs: number
  texts: string[]
}

function statusError(status: number, message = 'failed'): Error {
  return Object.assign(new Error(message), { status })
}

interface Fixture {
  backfill: EmbeddingBackfill
  provider: EmbeddingProvider
  vectorStore: {
    chunkTextsForFile: (path: string) => Array<{ id: number; text: string }>
    attachVectors: ReturnType<typeof vi.fn>
  }
  queue: Map<string, FakeNote>
  onDisk: Map<string, number | null>
  attached: string[]
  attachCalls: Array<{ path: string; mtimeMs: number; count: number }>
  sent: string[][]
  log: ReturnType<typeof vi.fn>
  setEmbed: (fn: (texts: string[]) => Promise<Float32Array[]>) => void
  setAttach: (fn: (path: string) => 'attached' | 'stale') => void
  setAttachError: (error: Error | null) => void
}

/** An in-memory stand-in for the two stores, with the same attach rules. */
function setup(notes: Record<string, FakeNote>): Fixture {
  const queue = new Map<string, FakeNote>(Object.entries(notes))
  const onDisk = new Map<string, number | null>(
    Object.entries(notes).map(([path, note]) => [path, note.mtimeMs])
  )
  const attached: string[] = []
  const attachCalls: Array<{ path: string; mtimeMs: number; count: number }> = []
  const sent: string[][] = []
  const log = vi.fn()
  let embed: (texts: string[]) => Promise<Float32Array[]> = async (texts) =>
    texts.map(() => Float32Array.from([1, 0, 0, 0]))
  let attachResult: (path: string) => 'attached' | 'stale' = () => 'attached'
  let attachError: Error | null = null

  const provider: EmbeddingProvider = {
    dim: 4,
    embed: vi.fn(async (texts: string[]) => {
      sent.push(texts)
      return embed(texts)
    })
  }
  const vectorStore = {
    chunkTextsForFile: (path: string) =>
      (queue.get(path)?.texts ?? []).map((text, index) => ({ id: index + 1, text })),
    attachVectors: vi.fn((path: string, mtimeMs: number, items: unknown[]) => {
      attachCalls.push({ path, mtimeMs, count: items.length })
      if (attachError) throw attachError
      const result = attachResult(path)
      if (result === 'attached') {
        attached.push(path)
        queue.delete(path)
      }
      return result
    })
  }
  const indexState = {
    unembeddedSources: () =>
      [...queue.entries()]
        .map(([sourcePath, note]) => ({ sourcePath, mtimeMs: note.mtimeMs }))
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
  }
  const backfill = new EmbeddingBackfill({
    provider,
    vectorStore,
    indexState,
    fileMtimeMs: async (path) => onDisk.get(path) ?? null,
    log
  })
  return {
    backfill,
    provider,
    vectorStore,
    queue,
    onDisk,
    attached,
    attachCalls,
    sent,
    log,
    setEmbed: (fn: typeof embed) => (embed = fn),
    setAttach: (fn: typeof attachResult) => (attachResult = fn),
    setAttachError: (error: Error | null) => (attachError = error)
  }
}

/** Lets pending promise callbacks (not timers) finish. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
}

describe('EmbeddingBackfill', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends each note once, newest first, and attaches its vectors at the recorded modification time', async () => {
    const t = setup({
      'old.md': { mtimeMs: 100, texts: ['old one'] },
      'new.md': { mtimeMs: 300, texts: ['new one', 'new two'] },
      'mid.md': { mtimeMs: 200, texts: ['mid one'] }
    })

    t.backfill.kick()
    await settle()

    expect(t.sent).toEqual([['new one', 'new two'], ['mid one'], ['old one']])
    expect(t.attached).toEqual(['new.md', 'mid.md', 'old.md'])
    expect(t.attachCalls).toEqual([
      { path: 'new.md', mtimeMs: 300, count: 2 },
      { path: 'mid.md', mtimeMs: 200, count: 1 },
      { path: 'old.md', mtimeMs: 100, count: 1 }
    ])
    expect(t.backfill.state).toBe('idle')
  })

  it('sends nothing when no note is waiting', async () => {
    const t = setup({})

    t.backfill.kick()
    await settle()

    expect(t.provider.embed).not.toHaveBeenCalled()
    expect(t.backfill.state).toBe('idle')
  })

  it('runs one at a time: a second kick while running makes one more look, not a second runner', async () => {
    const t = setup({ 'a.md': { mtimeMs: 1, texts: ['a'] } })
    let release: (v: Float32Array[]) => void = () => {}
    t.setEmbed(() => new Promise((resolve) => (release = resolve)))

    t.backfill.kick()
    await settle()
    t.backfill.kick()
    t.backfill.kick()
    await settle()
    expect(t.provider.embed).toHaveBeenCalledTimes(1)
    expect(t.backfill.state).toBe('running')

    release([Float32Array.from([1, 0, 0, 0])])
    await settle()

    expect(t.attached).toEqual(['a.md'])
    expect(t.provider.embed).toHaveBeenCalledTimes(1)
    expect(t.backfill.state).toBe('idle')
  })

  it('picks up a note that is queued while it runs', async () => {
    const t = setup({ 'a.md': { mtimeMs: 1, texts: ['a'] } })
    let release: (v: Float32Array[]) => void = () => {}
    t.setEmbed(() => new Promise((resolve) => (release = resolve)))
    t.backfill.kick()
    await settle()

    t.queue.set('b.md', { mtimeMs: 2, texts: ['b'] })
    t.onDisk.set('b.md', 2)
    t.backfill.kick()
    t.setEmbed(async (texts) => texts.map(() => Float32Array.from([1, 0, 0, 0])))
    release([Float32Array.from([1, 0, 0, 0])])
    await settle()

    expect(t.attached.sort()).toEqual(['a.md', 'b.md'])
  })

  it('looks again when a kick arrives as the run finds nothing left', async () => {
    const t = setup({})
    let looked = 0
    const backfill: EmbeddingBackfill = new EmbeddingBackfill({
      provider: t.provider,
      vectorStore: t.vectorStore,
      indexState: {
        unembeddedSources: () => {
          if (++looked === 1) {
            // A note is queued and its kick lands during the run's last look, which saw nothing.
            t.queue.set('late.md', { mtimeMs: 7, texts: ['late'] })
            t.onDisk.set('late.md', 7)
            backfill.kick()
            return []
          }
          return [...t.queue.entries()].map(([sourcePath, note]) => ({
            sourcePath,
            mtimeMs: note.mtimeMs
          }))
        }
      },
      fileMtimeMs: async (path) => t.onDisk.get(path) ?? null
    })

    backfill.kick()
    await settle()

    expect(t.attached).toEqual(['late.md'])
  })

  describe('a note that changed since it was indexed', () => {
    it('is not sent when the file on disk is newer than the recorded state, and the rest go on', async () => {
      const t = setup({
        'edited.md': { mtimeMs: 200, texts: ['edited'] },
        'fine.md': { mtimeMs: 100, texts: ['fine'] }
      })
      t.onDisk.set('edited.md', 250)

      t.backfill.kick()
      await settle()

      expect(t.sent).toEqual([['fine']])
      expect(t.attached).toEqual(['fine.md'])
    })

    it('is not sent when the file is gone', async () => {
      const t = setup({ 'gone.md': { mtimeMs: 100, texts: ['gone'] } })
      t.onDisk.set('gone.md', null)

      t.backfill.kick()
      await settle()

      expect(t.provider.embed).not.toHaveBeenCalled()
    })

    it('is looked at again on the next kick, once the indexer has caught up', async () => {
      const t = setup({ 'edited.md': { mtimeMs: 200, texts: ['edited'] } })
      t.onDisk.set('edited.md', 250)
      t.backfill.kick()
      await settle()
      expect(t.provider.embed).not.toHaveBeenCalled()

      t.queue.set('edited.md', { mtimeMs: 250, texts: ['edited again'] })
      t.backfill.kick()
      await settle()

      expect(t.sent).toEqual([['edited again']])
      expect(t.attached).toEqual(['edited.md'])
    })

    it('is looked at again when the store finds it changed while the request was out', async () => {
      const t = setup({ 'a.md': { mtimeMs: 1, texts: ['a'] } })
      let calls = 0
      t.setAttach(() => (++calls === 1 ? 'stale' : 'attached'))

      t.backfill.kick()
      await settle()

      expect(t.sent).toHaveLength(2)
      expect(t.attached).toEqual(['a.md'])
    })

    it('is left to the next run when it keeps changing', async () => {
      const t = setup({
        'busy.md': { mtimeMs: 2, texts: ['busy'] },
        'calm.md': { mtimeMs: 1, texts: ['calm'] }
      })
      t.setAttach((path) => (path === 'busy.md' ? 'stale' : 'attached'))

      t.backfill.kick()
      await settle()

      // Three tries, then it stops asking for it and the other note is done.
      expect(t.sent.filter((texts) => texts[0] === 'busy')).toHaveLength(3)
      expect(t.attached).toEqual(['calm.md'])
      expect(t.backfill.state).toBe('idle')
    })
  })

  describe('failures', () => {
    it.each([
      ['offline', new Error('Connection error.')],
      ['rate-limit', statusError(429)],
      ['service', statusError(503)]
    ])(
      'a %s failure pauses, then retries after 1, 5 and 15 minutes, and keeps 15',
      async (_name, error) => {
        const t = setup({ 'a.md': { mtimeMs: 1, texts: ['a'] } })
        t.setEmbed(async () => {
          throw error
        })

        t.backfill.kick()
        await settle()
        expect(t.backfill.state).toBe('paused')
        expect(t.provider.embed).toHaveBeenCalledTimes(1)

        for (const [index, delay] of [...RETRY_DELAYS_MS, RETRY_DELAYS_MS[2]].entries()) {
          await vi.advanceTimersByTimeAsync(delay - 1)
          expect(t.provider.embed).toHaveBeenCalledTimes(index + 1)
          await vi.advanceTimersByTimeAsync(1)
          await settle()
          expect(t.provider.embed).toHaveBeenCalledTimes(index + 2)
          expect(t.backfill.state).toBe('paused')
        }
        expect(RETRY_DELAYS_MS).toEqual([60_000, 300_000, 900_000])
      }
    )

    it('goes on from where it stopped when a retry works, and starts the delays over', async () => {
      const t = setup({
        'a.md': { mtimeMs: 2, texts: ['a'] },
        'b.md': { mtimeMs: 1, texts: ['b'] }
      })
      let fail = true
      t.setEmbed(async (texts) => {
        if (fail) throw statusError(500)
        return texts.map(() => Float32Array.from([1, 0, 0, 0]))
      })
      t.backfill.kick()
      await settle()
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0])
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[1])
      expect(t.provider.embed).toHaveBeenCalledTimes(3)

      fail = false
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[2])
      await settle()
      expect(t.attached).toEqual(['a.md', 'b.md'])
      expect(t.backfill.state).toBe('idle')

      // A later failure begins again at one minute.
      t.queue.set('c.md', { mtimeMs: 3, texts: ['c'] })
      t.onDisk.set('c.md', 3)
      fail = true
      const before = vi.mocked(t.provider.embed).mock.calls.length
      t.backfill.kick()
      await settle()
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0])
      expect(vi.mocked(t.provider.embed).mock.calls.length).toBe(before + 2)
    })

    it('a kick while paused tries again at once and cancels the wait', async () => {
      const t = setup({ 'a.md': { mtimeMs: 1, texts: ['a'] } })
      let fail = true
      t.setEmbed(async (texts) => {
        if (fail) throw statusError(429)
        return texts.map(() => Float32Array.from([1, 0, 0, 0]))
      })
      t.backfill.kick()
      await settle()
      expect(t.backfill.state).toBe('paused')

      fail = false
      t.backfill.kick()
      await settle()

      expect(t.attached).toEqual(['a.md'])
      expect(t.backfill.state).toBe('idle')
      const calls = vi.mocked(t.provider.embed).mock.calls.length
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0] * 2)
      expect(vi.mocked(t.provider.embed).mock.calls.length).toBe(calls)
    })

    it.each([401, 403])(
      'a %s waits for the settings to change: no timer and no kick sends anything',
      async (status) => {
        const t = setup({ 'a.md': { mtimeMs: 1, texts: ['a'] } })
        t.setEmbed(async () => {
          throw statusError(status)
        })

        t.backfill.kick()
        await settle()
        expect(t.backfill.state).toBe('paused')
        await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[2] * 3)
        t.backfill.kick()
        await settle()

        expect(t.provider.embed).toHaveBeenCalledTimes(1)
        expect(t.backfill.state).toBe('paused')
      }
    )

    it('a note the service rejects is skipped and the others go on; it is sent again only after it changes', async () => {
      const t = setup({
        'bad.md': { mtimeMs: 2, texts: ['too long'] },
        'good.md': { mtimeMs: 1, texts: ['fine'] }
      })
      t.setEmbed(async (texts) => {
        if (texts[0] === 'too long') throw statusError(400)
        return texts.map(() => Float32Array.from([1, 0, 0, 0]))
      })

      t.backfill.kick()
      await settle()
      expect(t.attached).toEqual(['good.md'])
      expect(t.backfill.state).toBe('idle')

      t.backfill.kick()
      await settle()
      expect(t.sent.filter((texts) => texts[0] === 'too long')).toHaveLength(1)

      t.queue.set('bad.md', { mtimeMs: 5, texts: ['shorter'] })
      t.onDisk.set('bad.md', 5)
      t.setEmbed(async (texts) => texts.map(() => Float32Array.from([1, 0, 0, 0])))
      t.backfill.kick()
      await settle()
      expect(t.attached).toEqual(['good.md', 'bad.md'])
    })

    it('a reply with a vector missing is a service failure, not stored', async () => {
      const t = setup({ 'a.md': { mtimeMs: 1, texts: ['a', 'b'] } })
      t.setEmbed(async (texts) => {
        const result: Float32Array[] = new Array(texts.length)
        result[0] = Float32Array.from([1, 0, 0, 0])
        return result
      })

      t.backfill.kick()
      await settle()

      expect(t.vectorStore.attachVectors).not.toHaveBeenCalled()
      expect(t.backfill.state).toBe('paused')
    })

    it('a reply with too few vectors is a service failure, not stored', async () => {
      const t = setup({ 'a.md': { mtimeMs: 1, texts: ['a', 'b'] } })
      t.setEmbed(async () => [Float32Array.from([1, 0, 0, 0])])

      t.backfill.kick()
      await settle()

      expect(t.vectorStore.attachVectors).not.toHaveBeenCalled()
      expect(t.backfill.state).toBe('paused')
    })

    it('vectors that do not fit the index leave that note alone and the others go on', async () => {
      const t = setup({
        'a.md': { mtimeMs: 2, texts: ['a'] },
        'b.md': { mtimeMs: 1, texts: ['b'] }
      })
      t.setAttachError(new Error('Vector dim 2 does not match store dim 4'))
      t.backfill.kick()
      await settle()
      t.setAttachError(null)

      expect(t.attachCalls.map((call) => call.path)).toEqual(['a.md', 'b.md'])
      expect(t.backfill.state).toBe('idle')
    })

    it('logs the class and a code, never a message', async () => {
      const t = setup({ 'a.md': { mtimeMs: 1, texts: ['Quarterly plan secret text'] } })
      t.setEmbed(async () => {
        throw statusError(401, 'Incorrect API key provided: sk-live-abc123 for Quarterly plan')
      })

      t.backfill.kick()
      await settle()

      expect(t.log).toHaveBeenCalledWith('Ryte embedding step paused.', 'auth 401')
      const logged = JSON.stringify(t.log.mock.calls)
      expect(logged).not.toContain('sk-live')
      expect(logged).not.toContain('Quarterly')
      expect(logged).not.toContain('a.md')
    })
  })

  describe('stop', () => {
    it('clears the retry wait, so nothing is sent afterwards', async () => {
      const t = setup({ 'a.md': { mtimeMs: 1, texts: ['a'] } })
      t.setEmbed(async () => {
        throw statusError(500)
      })
      t.backfill.kick()
      await settle()

      expect(vi.getTimerCount()).toBe(1)
      t.backfill.stop()
      expect(vi.getTimerCount()).toBe(0)
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[2] * 3)

      expect(t.provider.embed).toHaveBeenCalledTimes(1)
    })

    it('ends a run at the next note: a request already out is not attached and no further one is sent', async () => {
      const t = setup({
        'a.md': { mtimeMs: 2, texts: ['a'] },
        'b.md': { mtimeMs: 1, texts: ['b'] }
      })
      let release: (v: Float32Array[]) => void = () => {}
      t.setEmbed(() => new Promise((resolve) => (release = resolve)))
      t.backfill.kick()
      await settle()

      t.backfill.stop()
      release([Float32Array.from([1, 0, 0, 0])])
      await settle()

      expect(t.vectorStore.attachVectors).not.toHaveBeenCalled()
      expect(t.provider.embed).toHaveBeenCalledTimes(1)
    })

    it('does not start again on a kick', async () => {
      const t = setup({ 'a.md': { mtimeMs: 1, texts: ['a'] } })
      t.backfill.stop()

      t.backfill.kick()
      await settle()

      expect(t.provider.embed).not.toHaveBeenCalled()
    })

    it('stops before the stat answers, without sending', async () => {
      const t = setup({ 'a.md': { mtimeMs: 1, texts: ['a'] } })
      let answer: (v: number | null) => void = () => {}
      const slow = new EmbeddingBackfill({
        provider: t.provider,
        vectorStore: t.vectorStore,
        indexState: { unembeddedSources: () => [{ sourcePath: 'a.md', mtimeMs: 1 }] },
        fileMtimeMs: () => new Promise((resolve) => (answer = resolve))
      })
      slow.kick()
      await settle()

      slow.stop()
      answer(1)
      await settle()

      expect(t.provider.embed).not.toHaveBeenCalled()
    })
  })
})

describe('fileMtimeReader', () => {
  it('reads a note under the folder as the indexer records it, and null when it is missing', async () => {
    const { mkdtempSync, writeFileSync, rmSync, utimesSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'ryte-mtime-'))
    try {
      writeFileSync(join(dir, 'a.md'), 'x')
      utimesSync(join(dir, 'a.md'), 1_700_000_000.5, 1_700_000_000.5)

      const read = fileMtimeReader(dir)

      expect(await read('a.md')).toBe(1_700_000_000_500)
      expect(await read('missing.md')).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
