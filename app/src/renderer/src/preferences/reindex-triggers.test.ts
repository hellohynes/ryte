import { describe, expect, it } from 'vitest'

import { patchRequiresReindex } from './reindex-triggers'

const current = {
  notesRoot: '/notes',
  semanticIndexEnabled: false,
  embeddingProvider: 'openai' as const,
  embeddingModel: 'text-embedding-3-small' as const
}

describe('patchRequiresReindex', () => {
  it('asks for a reindex when the notes folder changes', () => {
    expect(patchRequiresReindex(current, { notesRoot: '/elsewhere' })).toBe(true)
  })

  it('asks for one when semantic search is switched on or off', () => {
    expect(patchRequiresReindex(current, { semanticIndexEnabled: true })).toBe(true)
    expect(
      patchRequiresReindex(
        { ...current, semanticIndexEnabled: true },
        { semanticIndexEnabled: false }
      )
    ).toBe(true)
  })

  it('asks for one when the OpenAI key changes while semantic search is on, since that is what embeds', () => {
    const on = { ...current, semanticIndexEnabled: true }
    expect(patchRequiresReindex(on, { openaiKey: 'sk-test' })).toBe(true)
    expect(patchRequiresReindex(on, { deleteProviderKeys: ['openai'] })).toBe(true)
    expect(patchRequiresReindex(on, { anthropicKey: 'sk-ant' })).toBe(false)
    expect(patchRequiresReindex(on, { deleteProviderKeys: ['anthropic'] })).toBe(false)
  })

  it('does not reindex for an OpenAI key while semantic search is off, since nothing embeds', () => {
    expect(patchRequiresReindex(current, { openaiKey: 'sk-test' })).toBe(false)
    expect(patchRequiresReindex(current, { deleteProviderKeys: ['openai'] })).toBe(false)
    // Turning semantic search on together with the key still reindexes.
    expect(
      patchRequiresReindex(current, { openaiKey: 'sk-test', semanticIndexEnabled: true })
    ).toBe(true)
  })

  it('does not ask for one for a change that leaves what is indexed alone', () => {
    // A save that only sets scrollbars, fonts or consent leaves most fields out of the patch.
    expect(patchRequiresReindex(current, { scrollbarVisibility: 'always' })).toBe(false)
    expect(patchRequiresReindex(current, { fontFamily: 'roboto' })).toBe(false)
    expect(patchRequiresReindex(current, { cloudAnswersEnabled: true })).toBe(false)
    expect(patchRequiresReindex(current, { notesRoot: '/notes' })).toBe(false)
    expect(patchRequiresReindex(current, { semanticIndexEnabled: false })).toBe(false)
  })
})
