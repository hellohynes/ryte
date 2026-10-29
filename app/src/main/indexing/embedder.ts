import OpenAI from 'openai'

export const BATCH_SIZE = 64
const DEFAULT_RETRY_DELAYS_MS = [1000, 2000, 4000]

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
  retryDelaysMs?: number[]
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dim: number
  private readonly client: OpenAI
  private readonly model: EmbeddingModel
  private readonly retryDelaysMs: number[]

  constructor(apiKey: string, opts: OpenAIProviderOptions = {}) {
    this.model = opts.model ?? 'text-embedding-3-small'
    this.dim = MODEL_DIMS[this.model]
    this.retryDelaysMs = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
    this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: false })
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const result: Float32Array[] = new Array(texts.length)
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      const batch = texts.slice(start, start + BATCH_SIZE)
      const vectors = await this.embedBatchWithRetry(batch)
      for (let i = 0; i < vectors.length; i++) {
        result[start + i] = vectors[i]
      }
    }
    return result
  }

  private async embedBatchWithRetry(batch: string[]): Promise<Float32Array[]> {
    let lastError: unknown
    for (let attempt = 0; attempt < this.retryDelaysMs.length; attempt++) {
      try {
        const resp = await this.client.embeddings.create({
          model: this.model,
          input: batch
        })
        const ordered: Float32Array[] = new Array(resp.data.length)
        for (const item of resp.data) {
          ordered[item.index] = Float32Array.from(item.embedding)
        }
        return ordered
      } catch (err) {
        lastError = err
        if (!isRateLimit(err)) throw err
        if (attempt === this.retryDelaysMs.length - 1) break
        await sleep(this.retryDelaysMs[attempt])
      }
    }
    throw lastError
  }
}

function isRateLimit(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { status?: number }).status === 429
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
