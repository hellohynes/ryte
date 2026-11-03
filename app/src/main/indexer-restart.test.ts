import { describe, expect, it, vi } from 'vitest'

import { createIndexerRestarter } from './indexer-restart'

interface Harness {
  calls: string[]
  restart: (options?: { reindex?: boolean }) => Promise<void>
  failReindex: (error: unknown) => void
  fail: (step: string, error: Error) => void
  setInitReady: (ready: boolean) => void
  setNotesRoot: (root: string) => void
}

function harness(): Harness {
  const calls: string[] = []
  const failures = new Map<string, Error>()
  let initReady = true
  let reindexFailure: { error: unknown } | null = null
  let root = '/synthetic/old-root'
  const step = (name: string): void => {
    calls.push(name)
    const failure = failures.get(name)
    if (failure) throw failure
  }
  const restart = createIndexerRestarter({
    watcher: {
      stop: async () => {
        calls.push('watcher.stop:begin')
        await Promise.resolve()
        await Promise.resolve()
        calls.push('watcher.stop:end')
        const failure = failures.get('watcher.stop')
        if (failure) throw failure
      },
      start: (notesRoot) => {
        calls.push(`watcher.start:${notesRoot}`)
      }
    },
    indexer: {
      close: () => step('indexer.close'),
      init: () => {
        step('indexer.init')
        return initReady
      }
    },
    cancelSearches: () => step('searches.cancel'),
    resetSearchService: () => step('searchService.reset'),
    notesRoot: () => {
      calls.push('notesRoot.read')
      return root
    },
    startReindex: async () => {
      calls.push('reindex.start')
      if (reindexFailure) throw reindexFailure.error
    }
  })
  return {
    calls,
    restart,
    failReindex: (error) => {
      reindexFailure = { error }
    },
    fail: (name, error) => failures.set(name, error),
    setInitReady: (ready) => {
      initReady = ready
    },
    setNotesRoot: (value) => {
      root = value
    }
  }
}

describe('createIndexerRestarter', () => {
  it('runs nothing until it is called', () => {
    const { calls } = harness()

    expect(calls).toEqual([])
  })

  it('stops and awaits the watcher, cancels searches, closes, resets the search service, initialises, then starts the watcher on the current notes root', async () => {
    const { calls, restart, setNotesRoot } = harness()
    setNotesRoot('/synthetic/new-root')

    await restart()

    expect(calls).toEqual([
      'watcher.stop:begin',
      'watcher.stop:end',
      'searches.cancel',
      'indexer.close',
      'searchService.reset',
      'indexer.init',
      'notesRoot.read',
      'watcher.start:/synthetic/new-root'
    ])
  })

  it('reads the notes root only after the indexer is initialised', async () => {
    const { calls, restart } = harness()

    await restart()

    expect(calls.indexOf('notesRoot.read')).toBeGreaterThan(calls.indexOf('indexer.init'))
  })

  it('does not start the watcher, or read the notes root, when the indexer cannot initialise', async () => {
    const { calls, restart, setInitReady } = harness()
    setInitReady(false)

    await restart()

    expect(calls.at(-1)).toBe('indexer.init')
    expect(calls).not.toContain('notesRoot.read')
    expect(calls.some((call) => call.startsWith('watcher.start'))).toBe(false)
  })

  describe('starting the reindex', () => {
    it('starts it last, after the watcher, when asked to', async () => {
      const { calls, restart, setNotesRoot } = harness()
      setNotesRoot('/synthetic/new-root')

      await restart({ reindex: true })

      expect(calls.slice(-2)).toEqual(['watcher.start:/synthetic/new-root', 'reindex.start'])
      expect(calls.filter((call) => call === 'reindex.start')).toHaveLength(1)
    })

    it('does not start it unless asked to', async () => {
      const { calls, restart } = harness()

      await restart()
      await restart({ reindex: false })

      expect(calls).not.toContain('reindex.start')
    })

    it('does not start it, and does not initialise the indexer a second time, when the indexer cannot initialise', async () => {
      const { calls, restart, setInitReady } = harness()
      setInitReady(false)

      await restart({ reindex: true })

      expect(calls).not.toContain('reindex.start')
      expect(calls.filter((call) => call === 'indexer.init')).toHaveLength(1)
    })

    it.each(['watcher.stop', 'searches.cancel', 'indexer.close', 'indexer.init'])(
      'does not start it when %s throws',
      async (stepName) => {
        const { calls, restart, fail } = harness()
        fail(stepName, new Error(`${stepName} failed`))

        await expect(restart({ reindex: true })).rejects.toThrow()

        expect(calls).not.toContain('reindex.start')
      }
    )

    it('does not wait for it, and does not reject or leave an unhandled rejection when it fails', async () => {
      const { restart, failReindex } = harness()
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      const unhandled = vi.fn()
      process.on('unhandledRejection', unhandled)
      try {
        failReindex(Object.assign(new Error('boom /notes/secret-title.md'), { code: 'EIO' }))

        await expect(restart({ reindex: true })).resolves.toBeUndefined()
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(unhandled).not.toHaveBeenCalled()
        expect(errors).toHaveBeenCalledWith(expect.any(String), 'EIO')
        expect(JSON.stringify(errors.mock.calls)).not.toContain('secret-title')
      } finally {
        process.off('unhandledRejection', unhandled)
        errors.mockRestore()
      }
    })

    it('does not wait for it to finish', async () => {
      const restart = createIndexerRestarter({
        watcher: { stop: async () => undefined, start: () => undefined },
        indexer: { close: () => undefined, init: () => true },
        cancelSearches: () => undefined,
        resetSearchService: () => undefined,
        notesRoot: () => '/synthetic/root',
        // A pass that takes as long as indexing a large folder.
        startReindex: () => new Promise<void>(() => undefined)
      })

      const outcome = await Promise.race([
        restart({ reindex: true }).then(() => 'returned'),
        new Promise((resolve) => setTimeout(() => resolve('waited'), 50))
      ])

      expect(outcome).toBe('returned')
    })

    it('does not reject when it throws before returning a promise', async () => {
      const calls: string[] = []
      const restart = createIndexerRestarter({
        watcher: { stop: async () => undefined, start: () => undefined },
        indexer: { close: () => undefined, init: () => true },
        cancelSearches: () => undefined,
        resetSearchService: () => undefined,
        notesRoot: () => '/synthetic/root',
        startReindex: () => {
          calls.push('reindex.start')
          throw new Error('synchronous failure')
        }
      })
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        await expect(restart({ reindex: true })).resolves.toBeUndefined()
        expect(calls).toEqual(['reindex.start'])
      } finally {
        errors.mockRestore()
      }
    })
  })

  it.each([
    ['watcher.stop', ['watcher.stop:begin', 'watcher.stop:end']],
    ['searches.cancel', ['watcher.stop:begin', 'watcher.stop:end', 'searches.cancel']],
    [
      'indexer.close',
      ['watcher.stop:begin', 'watcher.stop:end', 'searches.cancel', 'indexer.close']
    ],
    [
      'indexer.init',
      [
        'watcher.stop:begin',
        'watcher.stop:end',
        'searches.cancel',
        'indexer.close',
        'searchService.reset',
        'indexer.init'
      ]
    ]
  ])('rejects with the error of %s and runs nothing after it', async (stepName, expectedCalls) => {
    const { calls, restart, fail } = harness()
    fail(stepName, new Error(`${stepName} failed`))

    await expect(restart()).rejects.toThrow(`${stepName} failed`)

    expect(calls).toEqual(expectedCalls)
  })
})
