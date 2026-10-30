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

/** A hand-written area and a contract-built area of the same name become one object with both. */
export type MergeApi<TLegacy, TBuilt> = Omit<TLegacy, keyof TBuilt> & {
  [TArea in keyof TBuilt]: (TArea extends keyof TLegacy ? TLegacy[TArea] : unknown) & TBuilt[TArea]
}

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
      built[operation] = (...args: unknown[]): Promise<unknown> =>
        ipc.invoke(channel, ...args.slice(0, 1))
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

/** Merges the built areas over the hand-written API. On a name clash the contract method wins. */
export function mergeContractApi<TLegacy extends object, TBuilt extends object>(
  legacy: TLegacy,
  built: TBuilt
): MergeApi<TLegacy, TBuilt> {
  const merged: Record<string, unknown> = { ...(legacy as Record<string, unknown>) }
  for (const [area, methods] of Object.entries(built)) {
    merged[area] = { ...((legacy as Record<string, object>)[area] ?? {}), ...(methods as object) }
  }
  return merged as MergeApi<TLegacy, TBuilt>
}
