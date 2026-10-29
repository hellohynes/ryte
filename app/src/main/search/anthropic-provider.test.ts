import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockStream = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { stream: mockStream }
  }))
}))

import { AnthropicProvider } from './anthropic-provider'
import type { SearchChunk } from './llm-provider'

function fakeChunk(index: number, text: string): SearchChunk {
  return { index, sourcePath: 'a.md', headingPath: [], text }
}

function makeStream(tokens: string[]): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<unknown, void, unknown> {
      for (const text of tokens) {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text } }
      }
      yield { type: 'message_stop' }
    }
  }
}

describe('AnthropicProvider', () => {
  beforeEach(() => mockStream.mockReset())

  it('calls onToken for each streamed text delta', async () => {
    mockStream.mockReturnValue(makeStream(['Hello', ' world']))
    const provider = new AnthropicProvider('sk-test', 'claude-haiku-4-5')
    const tokens: string[] = []
    await provider.synthesize('test query', [fakeChunk(1, 'body')], (t) => tokens.push(t))
    expect(tokens).toEqual(['Hello', ' world'])
  })

  it('passes system + user message to messages.stream', async () => {
    mockStream.mockReturnValue(makeStream([]))
    const provider = new AnthropicProvider('sk-test', 'claude-haiku-4-5')
    await provider.synthesize('my question', [fakeChunk(1, 'source text')], () => {})
    expect(mockStream).toHaveBeenCalledOnce()
    const args = mockStream.mock.calls[0][0] as Record<string, unknown>
    expect(typeof args.system).toBe('string')
    expect(Array.isArray(args.messages)).toBe(true)
    const userMsg = (args.messages as Array<{ role: string; content: string }>)[0]
    expect(userMsg.role).toBe('user')
    expect(userMsg.content).toContain('my question')
    expect(userMsg.content).toContain('source text')
  })

  it('propagates errors from the stream', async () => {
    async function* failingStream(): AsyncGenerator<unknown, void, unknown> {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial' } }
      throw new Error('stream error')
    }
    mockStream.mockReturnValue({ [Symbol.asyncIterator]: failingStream })
    const provider = new AnthropicProvider('sk-test', 'claude-haiku-4-5')
    await expect(provider.synthesize('q', [fakeChunk(1, 'body')], () => {})).rejects.toThrow(
      'stream error'
    )
  })

  it('ignores non-text-delta events', async () => {
    mockStream.mockReturnValue({
      async *[Symbol.asyncIterator](): AsyncGenerator<unknown, void, unknown> {
        yield { type: 'message_start', message: {} }
        yield { type: 'content_block_start', content_block: { type: 'text' } }
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'real' } }
        yield { type: 'message_delta', delta: {} }
      }
    })
    const provider = new AnthropicProvider('sk-test', 'claude-haiku-4-5')
    const tokens: string[] = []
    await provider.synthesize('q', [fakeChunk(1, 'body')], (t) => tokens.push(t))
    expect(tokens).toEqual(['real'])
  })
})
