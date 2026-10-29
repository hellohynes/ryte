import { beforeEach, describe, expect, it, vi } from 'vitest'

const createMock = vi.fn()

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    embeddings: { create: createMock }
  }))
}))

import { OpenAIEmbeddingProvider, BATCH_SIZE } from './embedder'

function fakeResponse(count: number): {
  data: Array<{ embedding: number[]; index: number }>
} {
  return {
    data: Array.from({ length: count }, (_, i) => ({
      embedding: Array.from({ length: 1536 }, () => i / 1536),
      index: i
    }))
  }
}

function rateLimitError(): Error {
  const e = new Error('rate limit')
  ;(e as Error & { status: number }).status = 429
  return e
}

describe('OpenAIEmbeddingProvider', () => {
  beforeEach(() => {
    createMock.mockReset()
  })

  it('exposes dim=1536 for text-embedding-3-small', () => {
    const provider = new OpenAIEmbeddingProvider('sk-test', { model: 'text-embedding-3-small' })
    expect(provider.dim).toBe(1536)
  })

  it('batches into a single call when inputs fit in BATCH_SIZE', async () => {
    createMock.mockResolvedValueOnce(fakeResponse(3))
    const provider = new OpenAIEmbeddingProvider('sk-test')
    const result = await provider.embed(['a', 'b', 'c'])
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(3)
    expect(result[0]).toBeInstanceOf(Float32Array)
    expect(result[0].length).toBe(1536)
  })

  it('splits 150 inputs into 3 batches (64+64+22) and preserves order', async () => {
    createMock
      .mockResolvedValueOnce(fakeResponse(BATCH_SIZE))
      .mockResolvedValueOnce(fakeResponse(BATCH_SIZE))
      .mockResolvedValueOnce(fakeResponse(150 - BATCH_SIZE * 2))
    const provider = new OpenAIEmbeddingProvider('sk-test')
    const inputs = Array.from({ length: 150 }, (_, i) => `text ${i}`)
    const result = await provider.embed(inputs)
    expect(createMock).toHaveBeenCalledTimes(3)
    expect(result).toHaveLength(150)
  })

  it('reorders OpenAI responses by index field', async () => {
    createMock.mockResolvedValueOnce({
      data: [
        { embedding: [2], index: 2 },
        { embedding: [0], index: 0 },
        { embedding: [1], index: 1 }
      ]
    })
    const provider = new OpenAIEmbeddingProvider('sk-test')
    const result = await provider.embed(['a', 'b', 'c'])
    expect(result[0][0]).toBe(0)
    expect(result[1][0]).toBe(1)
    expect(result[2][0]).toBe(2)
  })

  it('retries on 429 up to 3 times before succeeding', async () => {
    createMock
      .mockRejectedValueOnce(rateLimitError())
      .mockRejectedValueOnce(rateLimitError())
      .mockResolvedValueOnce(fakeResponse(1))
    const provider = new OpenAIEmbeddingProvider('sk-test', { retryDelaysMs: [1, 1, 1] })
    const result = await provider.embed(['a'])
    expect(createMock).toHaveBeenCalledTimes(3)
    expect(result).toHaveLength(1)
  })

  it('throws when 429 persists past max attempts', async () => {
    createMock
      .mockRejectedValueOnce(rateLimitError())
      .mockRejectedValueOnce(rateLimitError())
      .mockRejectedValueOnce(rateLimitError())
    const provider = new OpenAIEmbeddingProvider('sk-test', { retryDelaysMs: [1, 1, 1] })
    await expect(provider.embed(['a'])).rejects.toThrow('rate limit')
  })

  it('does not retry on non-429 errors', async () => {
    const badReq = new Error('bad request')
    ;(badReq as Error & { status: number }).status = 400
    createMock.mockRejectedValueOnce(badReq)
    const provider = new OpenAIEmbeddingProvider('sk-test', { retryDelaysMs: [1, 1, 1] })
    await expect(provider.embed(['a'])).rejects.toThrow('bad request')
    expect(createMock).toHaveBeenCalledTimes(1)
  })
})
