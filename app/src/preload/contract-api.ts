// Builds the contract part of `window.ryte` from the generated manifest (channel names only). Types come
// from the contract through `import type`, which is erased at build time, so this file pulls nothing
// but the manifest into the sandboxed preload: no Zod and no Node built-ins.
import type { Contract } from '../contract'
import type {
  AreaDefinition,
  EventDefinition,
  EventPayloadArgs,
  OperationDefinition,
  OperationInput,
  OperationResult
} from '../contract/define'
import { manifest } from '../contract/manifest.generated'

export interface ContractManifest {
  readonly [area: string]: {
    readonly operations: Readonly<Record<string, string>>
    readonly events: Readonly<Record<string, string>>
  }
}

/** The slice of `ipcRenderer` the builder needs. The real `ipcRenderer` satisfies it. */
export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
}

type OperationArguments<TInput> = [TInput] extends [undefined]
  ? []
  : undefined extends TInput
    ? [input?: TInput]
    : [input: TInput]

type OperationMethod<TOperation extends OperationDefinition> = (
  ...args: OperationArguments<OperationInput<TOperation>>
) => Promise<OperationResult<TOperation>>

type EventSubscriber<TEvent extends EventDefinition> = (
  callback: (...payload: EventPayloadArgs<TEvent>) => void
) => () => void

export type AreaApi<TArea extends AreaDefinition> = {
  [TKey in keyof TArea['operations'] &
    string]: TArea['operations'][TKey] extends OperationDefinition
    ? OperationMethod<TArea['operations'][TKey]>
    : never
} & {
  [TKey in keyof TArea['events'] &
    string as `on${Capitalize<TKey>}`]: TArea['events'][TKey] extends EventDefinition
    ? EventSubscriber<TArea['events'][TKey]>
    : never
}

export type ContractApi = { [TArea in keyof Contract]: AreaApi<Contract[TArea]> }

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1)

/**
 * Builds one object per area with a method per operation and an `on<Event>` subscriber per event. The
 * manifest is the allowlist: nothing outside it is reachable. An operation forwards at most its first
 * argument, so `list()` sends no argument and `list(input)` sends the input.
 */
export function createContractApi<TApi = ContractApi>(
  ipc: IpcRendererLike,
  source: ContractManifest = manifest
): TApi {
  const api: Record<string, Record<string, unknown>> = {}

  for (const [area, names] of Object.entries(source)) {
    const built: Record<string, unknown> = {}

    for (const [operation, channel] of Object.entries(names.operations)) {
      built[operation] = (...args: unknown[]): Promise<unknown> => {
        const result = ipc.invoke(channel, ...args.slice(0, 1))
        if (area !== 'workspace' || operation !== 'openNativeFile') return result

        // Keep picker refusals readable without exposing wire names to the renderer. The prefix
        // follows the invoked manifest channel, including when the contract channel changes.
        return result.catch((error: unknown) => {
          const prefix = `Error invoking remote method '${channel}': Error:`
          if (error instanceof Error && error.message.startsWith(prefix)) {
            throw new Error(error.message.slice(prefix.length).trimStart())
          }
          throw error
        })
      }
    }

    for (const [event, channel] of Object.entries(names.events)) {
      built[`on${capitalize(event)}`] = (callback: (...payload: unknown[]) => void) => {
        const listener = (_event: unknown, ...payload: unknown[]): void => callback(...payload)
        ipc.on(channel, listener)
        return (): void => {
          ipc.removeListener(channel, listener)
        }
      }
    }

    api[area] = built
  }

  return api as TApi
}
