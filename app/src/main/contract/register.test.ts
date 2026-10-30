import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { contract, type Contract } from '../../contract'
import { ContractInputError, defineArea } from '../../contract/define'
import { fixtureStatusEvent, fixtureWhoAmI } from '../../contract/fixtures/shapes.fixture'
import { decode } from '../../contract/tasks.vectors.codec'
import { ACCEPTED_DEVIATIONS } from '../../contract/tasks.vectors.deviations'
import { taskVectors } from '../../contract/tasks.vectors.inputs'
import {
  createEmitter,
  registerOperations,
  type Handlers,
  type IpcMainLike,
  type WindowLike
} from './register'

type Listener = Parameters<IpcMainLike['handle']>[1]

// Mimics Electron: a second handler for the same channel throws.
function fakeIpc(): { ipc: IpcMainLike; listeners: Map<string, Listener> } {
  const listeners = new Map<string, Listener>()
  return {
    listeners,
    ipc: {
      handle(channel, listener) {
        if (listeners.has(channel)) {
          throw new Error(`Attempted to register a second handler for '${channel}'`)
        }
        listeners.set(channel, listener)
      }
    }
  }
}

const sender = { id: 1 } as never
const echo = (): ReturnType<typeof vi.fn> => vi.fn(async (input: unknown) => input)

function echoHandlers(): {
  handlers: Handlers<Contract>
  spies: Record<string, ReturnType<typeof vi.fn>>
} {
  // One spy per operation in the contract, so adding an operation does not break these tests.
  const spies: Record<string, ReturnType<typeof vi.fn>> = Object.fromEntries(
    Object.keys(contract.tasks.operations).map((name) => [name, echo()])
  )
  return { handlers: { tasks: spies } as unknown as Handlers<Contract>, spies }
}

// The wire strings, copied from the pre-contract code (recorded at a9ce30b in channels.baseline.json, since
// retired). They are the contract with the renderer, so they are pinned here as literals.
const TASKS_REQUEST_CHANNELS = ['tasks:list', 'tasks:refresh', 'tasks:toggle']
const TASKS_EVENT_CHANNEL = 'tasks:changed'

const recorded = (
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../contract/tasks.vectors.expected.json', import.meta.url)),
      'utf8'
    )
  ) as { vectors: Array<{ accepted: boolean; output?: unknown }> }
).vectors

describe('registerOperations: validation in front of every handler', () => {
  it.each(
    taskVectors
      .map((vector, index) => [vector.id, vector, recorded[index]] as const)
      .filter(([, vector]) => vector.op === 'list' || vector.op === 'toggle')
  )('%s', async (id, vector, expected) => {
    const { ipc, listeners } = fakeIpc()
    const { handlers, spies } = echoHandlers()
    registerOperations(ipc, contract, handlers)
    const spy = spies[vector.op]
    const call = listeners.get(`tasks:${vector.op}`)
    expect(call).toBeTypeOf('function')

    const deviation = ACCEPTED_DEVIATIONS[id]
    const shouldAccept = deviation ? deviation.accepted : expected.accepted

    if (shouldAccept) {
      await expect(call?.({ sender }, vector.input)).resolves.toStrictEqual(decode(expected.output))
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0]?.[1]).toEqual({ sender })
    } else {
      await expect(call?.({ sender }, vector.input)).rejects.toBeInstanceOf(ContractInputError)
      expect(spy, 'a rejected input must never reach the handler').not.toHaveBeenCalled()
    }
  })

  it('registers exactly the tasks request channels and owns the tasks event channel', () => {
    const { ipc, listeners } = fakeIpc()
    registerOperations(ipc, contract, echoHandlers().handlers)

    const registered = [...listeners.keys()].sort()
    // Exactly what the contract defines, nothing more...
    expect(registered).toEqual(
      Object.values(contract.tasks.operations)
        .map((operation) => operation.channel)
        .sort()
    )
    // ...and the pre-contract wire strings are still there, unchanged.
    expect(registered).toEqual(expect.arrayContaining(TASKS_REQUEST_CHANNELS))
    expect(contract.tasks.events.changed.channel).toBe(TASKS_EVENT_CHANNEL)
  })

  it('passes the calling sender to a sender-aware handler and validates its input', async () => {
    const registry = {
      fixture: defineArea('fixture', {
        operations: { whoAmI: fixtureWhoAmI },
        events: { status: fixtureStatusEvent }
      })
    }
    const { ipc, listeners } = fakeIpc()
    registerOperations(ipc, registry, {
      fixture: {
        whoAmI: (_input, ctx) => ({ senderId: (ctx.sender as unknown as { id: number }).id })
      }
    })

    const call = listeners.get('fixture:who-am-i')
    await expect(call?.({ sender: { id: 7 } as never }, undefined)).resolves.toEqual({
      senderId: 7
    })
    await expect(
      call?.({ sender: { id: 7 } as never }, { unexpected: true })
    ).rejects.toBeInstanceOf(ContractInputError)
  })
})

describe('registerOperations: registration failures', () => {
  it('throws when an operation has no handler', () => {
    const { ipc } = fakeIpc()
    const partial = { tasks: { list: echo(), refresh: echo() } } as unknown as Handlers<Contract>
    expect(() => registerOperations(ipc, contract, partial)).toThrow(
      'No handler for contract operation: tasks.toggle'
    )
  })

  it('throws when a handler has no matching operation', () => {
    const { ipc } = fakeIpc()
    const extra = {
      tasks: { list: echo(), refresh: echo(), toggle: echo(), bogus: echo() }
    } as unknown as Handlers<Contract>
    expect(() => registerOperations(ipc, contract, extra)).toThrow(
      'Handler for unknown operation: tasks.bogus'
    )
  })

  it('throws when a whole area has no handlers', () => {
    const { ipc } = fakeIpc()
    expect(() => registerOperations(ipc, contract, {} as unknown as Handlers<Contract>)).toThrow(
      'No handlers for contract area: tasks'
    )
  })

  it('throws on a duplicate channel inside the contract', () => {
    const { ipc } = fakeIpc()
    const registry = {
      dup: defineArea('dup', {
        operations: { first: fixtureWhoAmI, second: fixtureWhoAmI },
        events: {}
      })
    }
    const handlers = { dup: { first: echo(), second: echo() } } as unknown as Handlers<
      typeof registry
    >
    expect(() => registerOperations(ipc, registry, handlers)).toThrow(
      'Duplicate contract channel: fixture:who-am-i'
    )
  })

  it('fails when the same contract is registered twice on one ipcMain', () => {
    const { ipc } = fakeIpc()
    const { handlers } = echoHandlers()
    registerOperations(ipc, contract, handlers)
    expect(() => registerOperations(ipc, contract, handlers)).toThrow(/second handler/)
  })
})

function fakeWindow(destroyed = false): { win: WindowLike; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn()
  return { win: { webContents: { isDestroyed: () => destroyed, send } }, send }
}

describe('createEmitter', () => {
  it('does nothing with no windows', () => {
    const emit = createEmitter(() => [])
    expect(() => emit(contract.tasks.events.changed)).not.toThrow()
  })

  it('sends the channel, and nothing else, to every live window', () => {
    const first = fakeWindow()
    const second = fakeWindow()
    createEmitter(() => [first.win, second.win])(contract.tasks.events.changed)

    expect(first.send.mock.calls).toEqual([['tasks:changed']])
    expect(second.send.mock.calls).toEqual([['tasks:changed']])
  })

  it('skips a destroyed window and still reaches the others', () => {
    const live = fakeWindow()
    const destroyed = fakeWindow(true)
    createEmitter(() => [destroyed.win, live.win])(contract.tasks.events.changed)

    expect(destroyed.send).not.toHaveBeenCalled()
    expect(live.send).toHaveBeenCalledTimes(1)
  })

  it('delivers the payload of a payload-bearing event', () => {
    const live = fakeWindow()
    const emit = createEmitter(() => [live.win])
    emit(fixtureStatusEvent, { phase: 'idle', done: 1 })

    expect(live.send.mock.calls).toEqual([['fixture:status-event', { phase: 'idle', done: 1 }]])
    // @ts-expect-error a payload-bearing event requires its payload
    emit(fixtureStatusEvent)
  })
})
