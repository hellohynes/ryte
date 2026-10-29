import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

import type { ProviderId } from '../../shared/provider-registry'
import { describeProviderError } from './provider-errors'

export interface ProviderKeyValidationResult {
  ok: boolean
  provider: ProviderId
  validatedAt: string | null
  error?: string
}

export function normalizeAuthorizedModelIds(modelIds: string[]): string[] {
  return [...new Set(modelIds.filter((id) => id.length > 0))].sort((a, b) => a.localeCompare(b))
}

export async function listOpenAIModels(apiKey: string): Promise<string[]> {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: false })
  const page = await client.models.list({ signal: AbortSignal.timeout(10_000) })
  return normalizeAuthorizedModelIds(page.data.map((model) => model.id))
}

/** Lists the model IDs for the renderer; a failure carries a message with no key fragments. */
export async function listAuthorizedOpenAIModels(apiKey: string): Promise<string[]> {
  try {
    return await listOpenAIModels(apiKey)
  } catch (error) {
    throw new Error(describeProviderError(error, apiKey))
  }
}

export async function validateProviderKey(
  provider: ProviderId,
  apiKey: string
): Promise<ProviderKeyValidationResult> {
  const signal = AbortSignal.timeout(10_000)
  try {
    if (provider === 'openai') {
      await listOpenAIModels(apiKey)
    } else if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey })
      await client.models.list({ limit: 1 }, { signal })
    } else {
      return {
        ok: false,
        provider,
        validatedAt: null,
        error: 'Gemini key validation is not available yet.'
      }
    }

    return { ok: true, provider, validatedAt: new Date().toISOString() }
  } catch (error) {
    return {
      ok: false,
      provider,
      validatedAt: null,
      error: describeProviderError(error, apiKey)
    }
  }
}
