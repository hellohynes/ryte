import { describe, expect, it, vi } from 'vitest'

import { contract } from '../../contract'
import type { MarkdownTaskFact, TaskToggleResponse } from '../../contract/tasks'
import { registerOperations, type IpcMainLike } from './register'
import { createTaskHandlers } from './tasks-handlers'

const ctx = { sender: {} as never }

const task: MarkdownTaskFact = {
  id: 'task-1',
  sourcePath: 'folder/tasks.md',
  line: 3,
  checkboxColumn: 2,
  checked: true,
  rawLine: '- [x] Follow up',
  normalizedText: 'follow up',
  headingPath: [],
  occurrenceIndex: 0,
  fingerprint: 'f0',
  sourceMtimeMs: 1,
  extractedAt: '2026-10-30T00:00:00.000Z'
}

const toggleInput = {
  sourcePath: 'folder/tasks.md',
  line: 3,
  checkboxColumn: 2,
  checked: true,
  expectedLine: '- [ ] Follow up'
}

function setup(toggleResult: TaskToggleResponse | Error): {
  handlers: ReturnType<typeof createTaskHandlers>
  service: {
    list: ReturnType<typeof vi.fn>
    refresh: ReturnType<typeof vi.fn>
    toggle: ReturnType<typeof vi.fn>
  }
  emit: ReturnType<typeof vi.fn>
  load: ReturnType<typeof vi.fn>
} {
  const service = {
    list: vi.fn(async () => ({ notesRoot: '/notes', tasks: [task], refreshedAt: 't' })),
    refresh: vi.fn(async () => ({ notesRoot: '/notes', tasks: [task, task], refreshedAt: 't2' })),
    toggle: vi.fn(async () => {
      if (toggleResult instanceof Error) throw toggleResult
      return toggleResult
    })
  }
  const load = vi.fn(() => ({ notesRoot: '/notes' }))
  const emit = vi.fn()
  const handlers = createTaskHandlers({
    service: service as never,
    settings: { load },
    emit: emit as never
  })
  return { handlers, service, emit, load }
}

describe('createTaskHandlers', () => {
  it('lists with the current notes root and the parsed input', async () => {
    const { handlers, service } = setup({ ok: false, reason: 'missing-file' })
    const result = await handlers.list({ checked: false, limit: 25 }, ctx)

    expect(service.list).toHaveBeenCalledWith('/notes', { checked: false, limit: 25 })
    expect(result).toEqual({ notesRoot: '/notes', tasks: [task], refreshedAt: 't' })
  })

  it('refreshes and returns the summary, not the whole snapshot', async () => {
    const { handlers, service } = setup({ ok: false, reason: 'missing-file' })

    await expect(handlers.refresh(undefined, ctx)).resolves.toEqual({
      notesRoot: '/notes',
      taskCount: 2,
      refreshedAt: 't2'
    })
    expect(service.refresh).toHaveBeenCalledWith('/notes')
  })

  it('emits tasks:changed once when a toggle succeeds', async () => {
    const { handlers, emit } = setup({ ok: true, markdown: '- [x] Follow up', task })
    const result = await handlers.toggle(toggleInput, ctx)

    expect(result.ok).toBe(true)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(contract.tasks.events.changed)
  })

  it('does not emit when the toggle reports a failure', async () => {
    const { handlers, emit } = setup({ ok: false, reason: 'source-line-changed' })

    await expect(handlers.toggle(toggleInput, ctx)).resolves.toEqual({
      ok: false,
      reason: 'source-line-changed'
    })
    expect(emit).not.toHaveBeenCalled()
  })

  it('does not emit, and propagates the error, when the service throws', async () => {
    const { handlers, emit } = setup(new Error('disk gone'))

    await expect(handlers.toggle(toggleInput, ctx)).rejects.toThrow('disk gone')
    expect(emit).not.toHaveBeenCalled()
  })

  it('reads the notes root for every call, so a settings change takes effect', async () => {
    const { handlers, service, load } = setup({ ok: false, reason: 'missing-file' })
    load.mockReturnValueOnce({ notesRoot: '/first' }).mockReturnValueOnce({ notesRoot: '/second' })

    await handlers.list({}, ctx)
    await handlers.list({}, ctx)

    expect(service.list.mock.calls.map((call) => call[0])).toEqual(['/first', '/second'])
  })
})

describe('tasks handlers behind the registrar', () => {
  function register(toggleResult: TaskToggleResponse): ReturnType<typeof setup> & {
    call: (channel: string, input: unknown) => Promise<unknown>
  } {
    const parts = setup(toggleResult)
    const listeners = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
    // Only the tasks area, so this test does not depend on which other areas exist.
    registerOperations(
      { handle: (channel, listener) => void listeners.set(channel, listener) },
      { tasks: contract.tasks },
      { tasks: parts.handlers }
    )
    return {
      ...parts,
      call: async (channel, input) => listeners.get(channel)?.({ sender: {} as never }, input)
    }
  }

  it('rejects an invalid toggle before the service or the emitter is touched', async () => {
    const { call, service, emit } = register({ ok: true, markdown: '', task })

    await expect(call('tasks:toggle', { ...toggleInput, line: 0 })).rejects.toThrow(
      'Invalid tasks.toggle input: line'
    )
    await expect(
      call('tasks:toggle', { ...toggleInput, sourcePath: '../escape.md' })
    ).rejects.toThrow('Invalid tasks.toggle input: sourcePath')
    expect(service.toggle).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  })

  it('passes the normalized path to the service and emits once on success', async () => {
    const { call, service, emit } = register({ ok: true, markdown: '- [x] Follow up', task })

    await call('tasks:toggle', { ...toggleInput, sourcePath: './folder/tasks.md' })

    expect(service.toggle).toHaveBeenCalledWith('/notes', toggleInput)
    expect(emit).toHaveBeenCalledTimes(1)
  })

  it('treats a missing list input as no filter', async () => {
    const { call, service } = register({ ok: false, reason: 'missing-file' })

    await call('tasks:list', undefined)

    expect(service.list).toHaveBeenCalledWith('/notes', {})
  })
})
