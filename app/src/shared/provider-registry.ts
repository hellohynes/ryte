export type ProviderId = 'anthropic' | 'openai' | 'gemini'
export type AnswerProviderId = 'anthropic' | 'openai'
export type EmbeddingProviderId = 'openai'

export type ProviderCapability = 'answers' | 'streamingAnswers' | 'embeddings'

export type AnswerModelId = string

export type EmbeddingModelId = 'text-embedding-3-small'
export type ModelId = AnswerModelId

export interface ModelDefinition {
  id: string
  label: string
  providerId: ProviderId
  capabilities: ProviderCapability[]
  unavailable?: boolean
}

export interface ProviderDefinition {
  id: ProviderId
  label: string
  requiresApiKey: boolean
  capabilities: ProviderCapability[]
  setupUrl: string
  privacyUrl: string
  models: ModelDefinition[]
  unavailable?: boolean
}

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    requiresApiKey: true,
    capabilities: ['answers', 'streamingAnswers', 'embeddings'],
    setupUrl: 'https://platform.openai.com/api-keys',
    privacyUrl: 'https://openai.com/policies/privacy-policy',
    models: [
      {
        id: 'gpt-5.2',
        label: 'GPT-5.2',
        providerId: 'openai',
        capabilities: ['answers', 'streamingAnswers']
      },
      {
        id: 'gpt-5.1',
        label: 'GPT-5.1',
        providerId: 'openai',
        capabilities: ['answers', 'streamingAnswers']
      },
      {
        id: 'gpt-4o',
        label: 'GPT-4o',
        providerId: 'openai',
        capabilities: ['answers', 'streamingAnswers']
      },
      {
        id: 'gpt-4o-mini',
        label: 'GPT-4o mini',
        providerId: 'openai',
        capabilities: ['answers', 'streamingAnswers']
      },
      {
        id: 'text-embedding-3-small',
        label: 'text-embedding-3-small',
        providerId: 'openai',
        capabilities: ['embeddings']
      }
    ]
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    requiresApiKey: true,
    capabilities: ['answers', 'streamingAnswers'],
    setupUrl: 'https://console.anthropic.com/settings/keys',
    privacyUrl: 'https://www.anthropic.com/legal/privacy',
    models: [
      {
        id: 'claude-haiku-4-5',
        label: 'Claude Haiku 4.5',
        providerId: 'anthropic',
        capabilities: ['answers', 'streamingAnswers']
      },
      {
        id: 'claude-sonnet-4-6',
        label: 'Claude Sonnet 4.6',
        providerId: 'anthropic',
        capabilities: ['answers', 'streamingAnswers']
      },
      {
        id: 'claude-opus-4-7',
        label: 'Claude Opus 4.7',
        providerId: 'anthropic',
        capabilities: ['answers', 'streamingAnswers']
      }
    ]
  },
  {
    id: 'gemini',
    label: 'Gemini',
    requiresApiKey: true,
    capabilities: [],
    setupUrl: 'https://aistudio.google.com/app/apikey',
    privacyUrl: 'https://policies.google.com/privacy',
    unavailable: true,
    models: []
  }
]

export function providerDefinition(provider: ProviderId): ProviderDefinition {
  return PROVIDERS.find((candidate) => candidate.id === provider)!
}

export function isProviderId(value: unknown): value is ProviderId {
  return value === 'anthropic' || value === 'openai' || value === 'gemini'
}

export function isAnswerProviderId(value: unknown): value is AnswerProviderId {
  return value === 'anthropic' || value === 'openai'
}

export function isEmbeddingProviderId(value: unknown): value is EmbeddingProviderId {
  return value === 'openai'
}

export function isAnswerModelId(value: unknown): value is AnswerModelId {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 200
}

export function isEmbeddingModelId(value: unknown): value is EmbeddingModelId {
  return value === 'text-embedding-3-small'
}

export function answerModels(
  provider?: AnswerProviderId
): Array<ModelDefinition & { id: AnswerModelId }> {
  return PROVIDERS.flatMap((candidate) => candidate.models)
    .filter((model) => model.capabilities.includes('answers'))
    .filter((model) => !provider || model.providerId === provider) as Array<
    ModelDefinition & { id: AnswerModelId }
  >
}

export function providerForAnswerModel(model: AnswerModelId): AnswerProviderId {
  const definition = answerModels().find((candidate) => candidate.id === model)
  if (!definition || !isAnswerProviderId(definition.providerId)) {
    return model.startsWith('claude') ? 'anthropic' : 'openai'
  }
  return definition.providerId
}

export function defaultAnswerModelForProvider(provider: AnswerProviderId): AnswerModelId {
  return provider === 'openai' ? 'gpt-5.2' : 'claude-haiku-4-5'
}

export function answerModelBelongsToProvider(
  model: AnswerModelId,
  provider: AnswerProviderId
): boolean {
  return provider === 'anthropic' ? model.startsWith('claude') : !model.startsWith('claude')
}
