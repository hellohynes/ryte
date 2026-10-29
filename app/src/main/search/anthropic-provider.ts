import Anthropic from '@anthropic-ai/sdk'

import { buildSynthesisMessages, type LLMProvider, type SearchChunk } from './llm-provider'
import type { ModelId } from '../settings/settings-store'

const ANTHROPIC_MODEL_IDS: Partial<Record<ModelId, string>> = {
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  'claude-opus-4-7': 'claude-opus-4-7'
}

export class AnthropicProvider implements LLMProvider {
  private readonly client: Anthropic
  private readonly model: string

  constructor(apiKey: string, model: ModelId) {
    this.client = new Anthropic({ apiKey })
    this.model = ANTHROPIC_MODEL_IDS[model] ?? model
  }

  async synthesize(
    query: string,
    chunks: SearchChunk[],
    onToken: (token: string) => void,
    options: { signal?: AbortSignal } = {}
  ): Promise<void> {
    const { system, userContent } = buildSynthesisMessages(query, chunks)
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: userContent }]
      },
      { signal: options.signal }
    )
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        onToken(event.delta.text)
      }
    }
  }
}
