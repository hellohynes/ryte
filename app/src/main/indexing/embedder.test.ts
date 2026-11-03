import { beforeEach, describe, expect, it, vi } from 'vitest'

const createMock = vi.fn()

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    embeddings: { create: createMock }
  }))
}))

import OpenAI from 'openai'

import {
  BATCH_SIZE,
  EmbeddingReplyError,
  OpenAIEmbeddingProvider,
  REQUEST_TIMEOUT_MS,
  classifyEmbeddingError,
  describeEmbeddingError
} from './embedder'

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

function statusError(status: number, message = 'failed'): Error {
  const e = new Error(message)
  ;(e as Error & { status: number }).status = status
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

  it('builds the client with a 60 second timeout and no retries of its own', () => {
    vi.mocked(OpenAI).mockClear()

    new OpenAIEmbeddingProvider('sk-test')

    expect(REQUEST_TIMEOUT_MS).toBe(60_000)
    expect(vi.mocked(OpenAI)).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 60_000, maxRetries: 0 })
    )
  })

  it('makes one request per failure, whatever the status: the embedding step owns the retries', async () => {
    for (const status of [429, 500, 400, 401]) {
      createMock.mockReset()
      createMock.mockRejectedValueOnce(statusError(status))
      const provider = new OpenAIEmbeddingProvider('sk-test')
      await expect(provider.embed(['a'])).rejects.toThrow('failed')
      expect(createMock).toHaveBeenCalledTimes(1)
    }
  })
})

describe('classifyEmbeddingError', () => {
  it('sorts a failure into what to do next, by status', () => {
    expect(classifyEmbeddingError(statusError(401))).toBe('auth')
    expect(classifyEmbeddingError(statusError(403))).toBe('auth')
    expect(classifyEmbeddingError(statusError(429))).toBe('rate-limit')
    expect(classifyEmbeddingError(statusError(500))).toBe('service')
    expect(classifyEmbeddingError(statusError(503))).toBe('service')
    expect(classifyEmbeddingError(statusError(400))).toBe('bad-input')
    expect(classifyEmbeddingError(statusError(413))).toBe('bad-input')
    expect(classifyEmbeddingError(statusError(422))).toBe('bad-input')
  })

  it('treats a failure with no status, as a refused or timed-out connection gives, as offline', () => {
    expect(classifyEmbeddingError(new Error('Connection error.'))).toBe('offline')
    expect(classifyEmbeddingError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBe(
      'offline'
    )
    expect(classifyEmbeddingError(undefined)).toBe('offline')
  })

  it('treats a reply that is not one vector per text as the service failing', () => {
    expect(classifyEmbeddingError(new EmbeddingReplyError('1 vectors for 2 chunks'))).toBe(
      'service'
    )
  })
})

describe('describeEmbeddingError', () => {
  it('gives the class and the status or code, and never the message', () => {
    const secret = 'sk-live-abc123 and the note title Quarterly Plan'

    expect(describeEmbeddingError(statusError(401, secret))).toBe('auth 401')
    expect(describeEmbeddingError(Object.assign(new Error(secret), { code: 'ETIMEDOUT' }))).toBe(
      'offline ETIMEDOUT'
    )
    expect(describeEmbeddingError(new Error(secret))).toBe('offline')
    expect(describeEmbeddingError(new EmbeddingReplyError(secret))).toBe('service')
  })
})
