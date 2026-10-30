import type { WebContents } from 'electron'
import {
  parseOperationInput,
  type AreaDefinition,
  type EventDefinition,
  type EventPayloadArgs,
  type OperationDefinition,
  type OperationParsedInput,
  type OperationResult
} from '../../contract/define'

/** What a handler may know about its caller. `tasks` ignores it; dialog-style operations need `sender`. */
export interface HandlerContext {
  sender: WebContents
}

export type OperationHandler<TOperation extends OperationDefinition> = (
  input: OperationParsedInput<TOperation>,
  ctx: HandlerContext
) => OperationResult<TOperation> | Promise<OperationResult<TOperation>>

/** One handler per operation of every area. A missing or extra handler is a compile error. */
export type Handlers<TContract extends Record<string, AreaDefinition>> = {
  [TArea in keyof TContract]: {
    [TOperation in keyof TContract[TArea]['operations']]: TContract[TArea]['operations'][TOperation] extends OperationDefinition
      ? OperationHandler<TContract[TArea]['operations'][TOperation]>
      : never
  }
}

/** The slice of `ipcMain` the registrar needs. The real `ipcMain` satisfies it. */
export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: { sender: WebContents }, ...args: unknown[]) => unknown
  ): void
}

/**
 * Registers a validated handler for every operation in the registry. Input is parsed with the
 * operation's schema before the handler runs, so a rejected input never reaches it.
 */
export function registerOperations<TContract extends Record<string, AreaDefinition>>(
  ipc: IpcMainLike,
  registry: TContract,
  handlers: Handlers<TContract>
): void {
  const channels = new Set<string>()
  const claim = (channel: string): void => {
    if (channels.has(channel)) throw new Error(`Duplicate contract channel: ${channel}`)
    channels.add(channel)
  }

  for (const [areaName, area] of Object.entries(registry)) {
    const areaHandlers = (handlers as Record<string, Record<string, unknown>>)[areaName]
    if (!areaHandlers) throw new Error(`No handlers for contract area: ${areaName}`)

    for (const handlerName of Object.keys(areaHandlers)) {
      if (!(handlerName in area.operations)) {
        throw new Error(`Handler for unknown operation: ${areaName}.${handlerName}`)
      }
    }
    for (const event of Object.values(area.events)) claim(event.channel)

    for (const [operationName, operation] of Object.entries(area.operations)) {
      const handler = areaHandlers[operationName]
      const name = `${areaName}.${operationName}`
      if (typeof handler !== 'function')
        throw new Error(`No handler for contract operation: ${name}`)
      claim(operation.channel)

      ipc.handle(operation.channel, async (event, input) => {
        const parsed = parseOperationInput(name, operation.input, input)
        return (handler as OperationHandler<OperationDefinition>)(parsed, { sender: event.sender })
      })
    }
  }
}

/** The slice of a window the emitter needs. `BrowserWindow` satisfies it. */
export interface WindowLike {
  webContents: {
    isDestroyed(): boolean
    send(channel: string, ...args: unknown[]): void
  }
}

export type Emit = <TEvent extends EventDefinition>(
  event: TEvent,
  ...payload: EventPayloadArgs<TEvent>
) => void

/**
 * Broadcasts an event to every live window. The window provider is injected so the behavior is testable
 * without Electron. With no windows, or only destroyed ones, nothing is sent.
 */
export function createEmitter(getWindows: () => readonly WindowLike[]): Emit {
  return (event, ...payload) => {
    for (const win of getWindows()) {
      if (win.webContents.isDestroyed()) continue
      win.webContents.send(event.channel, ...payload)
    }
  }
}
