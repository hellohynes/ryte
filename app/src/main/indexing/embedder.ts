import OpenAI from 'openai'

export const BATCH_SIZE = 64
// A request that has not answered in this long is given up on; the embedding step decides when to try again.
export const REQUEST_TIMEOUT_MS = 60_000

export type EmbeddingModel = 'text-embedding-3-small' | 'text-embedding-3-large'

const MODEL_DIMS: Record<EmbeddingModel, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072
}

export interface EmbeddingProvider {
  readonly dim: number
  embed(texts: string[]): Promise<Float32Array[]>
}

export interface OpenAIProviderOptions {
  model?: EmbeddingModel
  timeoutMs?: number
}

/**
 * Why an embedding request failed, as far as what to do next is concerned. Never carries the error's
 * message, which can hold a note title or a key.
 */
export type EmbeddingFailure = 'auth' | 'rate-limit' | 'offline' | 'service' | 'bad-input'

/** The service answered, but not with one usable vector per text. */
export class EmbeddingReplyError extends Error {}

export function classifyEmbeddingError(error: unknown): EmbeddingFailure {
  if (error instanceof EmbeddingReplyError) return 'service'
  const status = (error as { status?: unknown } | null)?.status
  // The client gives no status to a connection that failed or timed out.
  if (typeof status !== 'number') return 'offline'
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate-limit'
  if (status >= 500) return 'service'
  if (status >= 400) return 'bad-input'
  return 'service'
}

/** What may be logged about a failure: its class and the status or system code, nothing else. */
export function describeEmbeddingError(error: unknown): string {
  const failure = classifyEmbeddingError(error)
  const detail = error as { status?: unknown; code?: unknown } | null
  const code = typeof detail?.status === 'number' ? detail.status : detail?.code
  return typeof code === 'number' || typeof code === 'string' ? `${failure} ${code}` : failure
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dim: number
  private readonly client: OpenAI
  private readonly model: EmbeddingModel

  constructor(apiKey: string, opts: OpenAIProviderOptions = {}) {
    this.model = opts.model ?? 'text-embedding-3-small'
    this.dim = MODEL_DIMS[this.model]
    // No client retries: the embedding step owns every retry, so a failure is seen once, at once.
    this.client = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: false,
      timeout: opts.timeoutMs ?? REQUEST_TIMEOUT_MS,
      maxRetries: 0
    })
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const result: Float32Array[] = new Array(texts.length)
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      const batch = texts.slice(start, start + BATCH_SIZE)
      const vectors = await this.embedBatch(batch)
      for (let i = 0; i < vectors.length; i++) {
        result[start + i] = vectors[i]
      }
    }
    return result
  }

  private async embedBatch(batch: string[]): Promise<Float32Array[]> {
    const resp = await this.client.embeddings.create({
      model: this.model,
      input: batch
    })
    const ordered: Float32Array[] = new Array(resp.data.length)
    for (const item of resp.data) {
      ordered[item.index] = Float32Array.from(item.embedding)
    }
    return ordered
  }
}
