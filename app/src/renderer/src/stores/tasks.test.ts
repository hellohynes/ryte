import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskFactsResponse } from '../../../shared/tasks'
import { useTasksStore } from './tasks'

function taskResponse(normalizedText: string): TaskFactsResponse {
  return {
    notesRoot: '/notes',
    refreshedAt: '2026-06-23T20:00:00.000Z',
    tasks: [
      {
        id: normalizedText,
        sourcePath: 'tasks.md',
        line: 3,
        checkboxColumn: 2,
        checked: false,
        rawLine: `- [ ] ${normalizedText}`,
        normalizedText,
        headingPath: ['Tasks'],
        occurrenceIndex: 0,
        fingerprint: normalizedText,
        sourceMtimeMs: 1,
        extractedAt: '2026-06-23T20:00:00.000Z'
      }
    ]
  }
}

async function flushAsync(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useTasksStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hydrates and refreshes on task change events', async () => {
    vi.useFakeTimers()
    const changedHandlers: Array<() => void> = []
    const list = vi.fn().mockResolvedValueOnce(taskResponse('First')).mockResolvedValueOnce({
      notesRoot: '/notes',
      refreshedAt: '2026-06-23T21:00:00.000Z',
      tasks: []
    })

    vi.stubGlobal('window', {
      ryte: {
        tasks: {
          list,
          onChanged: vi.fn((cb: () => void) => {
            changedHandlers.push(cb)
            return vi.fn()
          })
        }
      }
    })

    const store = useTasksStore()
    await store.hydrate()

    expect(store.openTasks.map((task) => task.normalizedText)).toEqual(['First'])
    expect(changedHandlers).toHaveLength(1)

    changedHandlers[0]?.()
    changedHandlers[0]?.()
    expect(list).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(150)
    await flushAsync()

    expect(list).toHaveBeenCalledTimes(2)
    expect(store.openTasks).toEqual([])
  })

  it('clears tasks instead of throwing when task loading fails', async () => {
    vi.stubGlobal('window', {
      ryte: {
        tasks: {
          list: vi.fn().mockRejectedValue(new Error('tasks failed')),
          onChanged: vi.fn(() => vi.fn())
        }
      }
    })

    const store = useTasksStore()
    await store.hydrate()

    expect(store.tasks).toEqual([])
    expect(store.error).toBe('tasks failed')
  })
})
