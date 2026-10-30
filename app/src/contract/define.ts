import type { ZodError, ZodType } from 'zod'
import type { z } from 'zod'

/**
 * One request/response operation. The definition is the single source for the channel name, the input
 * and response types, and input validation. Handlers, the preload API and the operations index are
 * derived from it. It stays an object so fields (for example agent exposure) can be added later.
 */
export interface OperationDefinition<
  TInput extends ZodType = ZodType,
  TOutput extends ZodType = ZodType
> {
  readonly channel: string
  readonly description: string
  readonly input: TInput
  readonly output: TOutput
  readonly example: {
    readonly input: z.input<TInput>
    readonly output: z.output<TOutput>
  }
}

/** One main-to-renderer event, optionally carrying a payload. */
export interface EventDefinition<TPayload extends ZodType | undefined = ZodType | undefined> {
  readonly channel: string
  readonly description: string
  readonly payload?: TPayload
}

export interface AreaDefinition<
  TOperations extends Record<string, OperationDefinition> = Record<string, OperationDefinition>,
  TEvents extends Record<string, EventDefinition> = Record<string, EventDefinition>
> {
  readonly name: string
  readonly operations: TOperations
  readonly events: TEvents
}

export function defineOperation<TInput extends ZodType, TOutput extends ZodType>(
  definition: OperationDefinition<TInput, TOutput>
): OperationDefinition<TInput, TOutput> {
  return definition
}

export function defineEvent<TPayload extends ZodType | undefined = undefined>(
  definition: EventDefinition<TPayload>
): EventDefinition<TPayload> {
  return definition
}

export function defineArea<
  TOperations extends Record<string, OperationDefinition>,
  TEvents extends Record<string, EventDefinition>
>(
  name: string,
  area: { operations: TOperations; events: TEvents }
): AreaDefinition<TOperations, TEvents> {
  return { name, operations: area.operations, events: area.events }
}

/** The type a caller passes to an operation. */
export type OperationInput<T extends OperationDefinition> = z.input<T['input']>
/** The validated value a handler receives. */
export type OperationParsedInput<T extends OperationDefinition> = z.output<T['input']>
/** The type an operation resolves to. */
export type OperationResult<T extends OperationDefinition> = z.output<T['output']>

/**
 * A rejected input. The message carries the operation name and issue paths only, never input values,
 * because inputs can contain note paths and text.
 */
export class ContractInputError extends Error {
  constructor(
    readonly operation: string,
    readonly paths: readonly string[]
  ) {
    super(`Invalid ${operation} input${paths.length > 0 ? `: ${paths.join(', ')}` : ''}`)
    this.name = 'ContractInputError'
  }
}

export function toContractInputError(operation: string, error: ZodError): ContractInputError {
  const paths = new Set<string>()
  for (const issue of error.issues) {
    const location = issue.path.map(String).join('.')
    if (issue.code === 'unrecognized_keys') {
      paths.add(location ? `${location} (unknown keys)` : '(unknown keys)')
    } else {
      paths.add(location || '(root)')
    }
  }
  return new ContractInputError(operation, [...paths].sort())
}

/** Validates an untrusted value against an operation's input schema. */
export function parseOperationInput<TInput extends ZodType>(
  operation: string,
  schema: TInput,
  value: unknown
): z.output<TInput> {
  const result = schema.safeParse(value)
  if (!result.success) throw toContractInputError(operation, result.error)
  return result.data
}
