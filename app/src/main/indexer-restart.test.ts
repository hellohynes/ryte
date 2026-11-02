import { describe, expect, it } from 'vitest'

import { createIndexerRestarter } from './indexer-restart'

interface Harness {
  calls: string[]
  restart: () => Promise<void>
  fail: (step: string, error: Error) => void
  setInitReady: (ready: boolean) => void
  setNotesRoot: (root: string) => void
}

function harness(): Harness {
  const calls: string[] = []
  const failures = new Map<string, Error>()
  let initReady = true
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
    }
  })
  return {
    calls,
    restart,
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
