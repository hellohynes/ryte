import { beforeEach, describe, expect, it, vi } from 'vitest'

const models = { list: vi.fn() }
vi.mock('openai', () => ({
  default: class {
    models = models
  }
}))

import {
  listAuthorizedOpenAIModels,
  normalizeAuthorizedModelIds,
  validateProviderKey
} from './key-validation'

const rejected = (): Error =>
  new Error('401 Incorrect API key provided: sk-proj-********************abcd. See the docs.')

describe('normalizeAuthorizedModelIds', () => {
  it('keeps every non-empty ID authorized for the key and returns a stable list', () => {
    expect(
      normalizeAuthorizedModelIds(['gpt-6-luna', 'text-embedding-3-small', 'gpt-6-luna', ''])
    ).toEqual(['gpt-6-luna', 'text-embedding-3-small'])
  })
})

describe('provider errors shown to the user', () => {
  beforeEach(() => {
    models.list.mockReset()
  })

  it('lists authorized model IDs', async () => {
    models.list.mockResolvedValue({ data: [{ id: 'gpt-6-luna' }, { id: 'gpt-5.2' }] })
    await expect(listAuthorizedOpenAIModels('sk-secret-key-1234')).resolves.toEqual([
      'gpt-5.2',
      'gpt-6-luna'
    ])
  })

  it('never passes a key fragment out when listing models fails', async () => {
    models.list.mockImplementation(async () => {
      throw rejected()
    })
    const failure = await listAuthorizedOpenAIModels('sk-secret-key-1234').catch((e: Error) => e)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain('Incorrect API key provided')
    expect((failure as Error).message).not.toMatch(/sk-/)
  })

  it('never returns a key fragment from key validation either', async () => {
    models.list.mockImplementation(async () => {
      throw rejected()
    })
    const result = await validateProviderKey('openai', 'sk-secret-key-1234')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Incorrect API key provided')
    expect(result.error).not.toMatch(/sk-/)
  })
})
