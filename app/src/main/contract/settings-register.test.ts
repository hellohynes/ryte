import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { ContractInputError } from '../../contract/define'
import { settings } from '../../contract/settings'
import { ACCEPTED_DEVIATIONS } from '../../contract/settings.vectors.deviations'
import { settingsVectors } from '../../contract/settings.vectors.inputs'
import { decode } from '../../contract/tasks.vectors.codec'
import { registerOperations, type IpcMainLike } from './register'
import { createSettingsHandlers } from './settings-handlers'

interface RecordedVector {
  id: string
  op: 'save' | 'provider'
  accepted: boolean
  output?: unknown
}

const recorded = (
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../contract/settings.vectors.expected.json', import.meta.url)),
      'utf8'
    )
  ) as { vectors: RecordedVector[] }
).vectors

type Listener = (event: { sender: never }, ...args: unknown[]) => unknown

function register(): {
  call: (channel: string, input: unknown) => unknown
  save: ReturnType<typeof vi.fn>
  validateKey: ReturnType<typeof vi.fn>
  listModels: ReturnType<typeof vi.fn>
  getState: ReturnType<typeof vi.fn>
} {
  const listeners = new Map<string, Listener>()
  const ipc: IpcMainLike = {
    handle: (channel, listener) => {
      listeners.set(channel, listener as Listener)
    }
  }
  const getState = vi.fn(async () => ({}) as never)
  const save = vi.fn(async () => ({}) as never)
  const validateKey = vi.fn(async () => ({}) as never)
  const listModels = vi.fn(async () => [])
  registerOperations(ipc, { settings }, { settings: { getState, save, validateKey, listModels } })
  return {
    call: (channel, input) => listeners.get(channel)?.({ sender: {} as never }, input),
    save,
    validateKey,
    listModels,
    getState
  }
}

describe('the recorded settings vectors, through the registrar', () => {
  it.each(settingsVectors.map((vector, index) => [vector.id, vector, recorded[index]] as const))(
    '%s',
    async (_id, vector, expected) => {
      const { call, save, validateKey } = register()
      const channel = vector.op === 'save' ? 'settings:save' : 'settings:validate-key'
      const input = vector.op === 'save' ? vector.input : { provider: vector.input }
      const handler = vector.op === 'save' ? save : validateKey
      const accepted = expected.accepted && !ACCEPTED_DEVIATIONS[vector.id]

      if (accepted) {
        await call(channel, input)
        expect(handler).toHaveBeenCalledTimes(1)
        const received = handler.mock.calls[0] as unknown[]
        const want = decode(expected.output)
        expect(
          vector.op === 'save' ? received[0] : (received[0] as { provider: unknown }).provider
        ).toStrictEqual(want)
      } else {
        await expect(Promise.resolve().then(() => call(channel, input))).rejects.toBeInstanceOf(
          ContractInputError
        )
        expect(handler, 'a rejected input must never reach the handler').not.toHaveBeenCalled()
      }
    }
  )
})

describe('settings through the registrar', () => {
  it('rejects a bare provider for validate-key and list-models before the handler', async () => {
    const { call, validateKey, listModels } = register()

    for (const [channel, handler] of [
      ['settings:validate-key', validateKey],
      ['settings:list-models', listModels]
    ] as const) {
      await expect(Promise.resolve().then(() => call(channel, 'openai'))).rejects.toBeInstanceOf(
        ContractInputError
      )
      expect(handler).not.toHaveBeenCalled()
      await call(channel, { provider: 'openai' })
      expect(handler).toHaveBeenCalledTimes(1)
    }
  })

  it('takes no input for get-state', async () => {
    const { call, getState } = register()

    await call('settings:get-state', undefined)
    expect(getState).toHaveBeenCalledTimes(1)
    await expect(
      Promise.resolve().then(() => call('settings:get-state', { x: 1 }))
    ).rejects.toBeInstanceOf(ContractInputError)
  })

  it('never lets a rejected patch with a key reach the handler, or echo the key', async () => {
    const { call, save } = register()
    const secret = 'synthetic-secret-key-value'

    let thrown: unknown
    try {
      await call('settings:save', { openaiKey: secret, notesRoot: 'relative-secret' })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(ContractInputError)
    expect((thrown as Error).message).toBe('Invalid settings.save input: notesRoot')
    expect(save).not.toHaveBeenCalled()
  })
})

describe('the real schema, handler and a fake store together', () => {
  it('hands the store the patch exactly as the schema parsed it: the key trimmed once, the model kept as given', async () => {
    const update = vi.fn(() => ({}) as never)
    const listeners = new Map<string, Listener>()
    const ipc: IpcMainLike = {
      handle: (channel, listener) => {
        listeners.set(channel, listener as Listener)
      }
    }
    registerOperations(
      ipc,
      { settings },
      {
        settings: createSettingsHandlers({
          store: {
            load: () => ({}) as never,
            update,
            publicState: () => ({}) as never,
            getSecret: () => null,
            markKeyValidated: () => ({}) as never,
            recordDiscoveredOpenAIModels: () => ({}) as never
          },
          applyColorMode: () => undefined,
          restartIndexing: async () => undefined,
          validateProviderKey: async () => ({ ok: false, provider: 'openai', validatedAt: null }),
          listAuthorizedOpenAIModels: async () => []
        })
      }
    )

    await listeners.get('settings:save')?.(
      { sender: {} as never },
      { answerModel: '  gpt-5.2  ', model: ' m ', openaiKey: '  synthetic-key-value  ' }
    )

    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0]).toEqual([
      { answerModel: '  gpt-5.2  ', model: ' m ', openaiKey: 'synthetic-key-value' }
    ])
  })
})
