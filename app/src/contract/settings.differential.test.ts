// A generated cross-check of the old validators against the new schemas while both exist. The authored
// vectors cover each rule; this explores combinations the authors did not list. The inputs avoid the
// deviation classes in `settings.vectors.deviations.ts` (extra acknowledgement fields, sparse arrays,
// inherited keys), which are stricter by decision. Deleted with the old validators when the area moves
// onto the registry; the vectors stay.
import { describe, expect, it } from 'vitest'

import { assertValidProviderId, assertValidSettingsPatch } from '../main/ipc-validation'
import { save, validateKey } from './settings'

// A small seeded generator, so a failure reproduces.
function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const validAck = {
  acknowledgedAt: '2026-01-01T00:00:00.000Z',
  provider: 'openai',
  model: 'gpt-5.2'
}
const junk: unknown[] = [
  undefined,
  null,
  0,
  1,
  Number.NaN,
  '',
  ' ',
  'x',
  true,
  false,
  [],
  {},
  [1],
  { a: 1 }
]
const strings = (values: string[]): unknown[] => [...values, ...junk]

const pools: Record<string, unknown[]> = {
  notesRoot: strings([
    '/a',
    '/Users/x/Notes',
    '/',
    'relative',
    '/' + 'a'.repeat(4095),
    '/' + 'a'.repeat(4096),
    '/a\0b'
  ]),
  model: strings(['gpt-5.2', ' x ', 'm', 'x'.repeat(200), 'x'.repeat(201), '   ']),
  answerModel: strings(['gpt-5.2', ' x ', 'm', 'x'.repeat(200), 'x'.repeat(201), '   ']),
  cloudAnswersEnabled: [true, false, ...junk],
  semanticIndexEnabled: [true, false, ...junk],
  searchHistoryIncludesAnswers: [true, false, ...junk],
  firstCloudUseAcknowledgedAt: [null, '2026-01-01', ...junk],
  cloudAnswersAcknowledgement: [
    null,
    validAck,
    { ...validAck, provider: 'gemini' },
    { acknowledgedAt: 'x', provider: 'openai' },
    { ...validAck, model: '' },
    { ...validAck, model: 5 },
    { ...validAck, provider: 'bogus' },
    ...junk
  ],
  semanticIndexAcknowledgement: [
    null,
    validAck,
    { ...validAck, provider: 'anthropic' },
    { provider: 'openai', model: 'm' },
    { ...validAck, acknowledgedAt: 5 },
    ...junk
  ],
  answerProvider: strings(['anthropic', 'openai', 'gemini']),
  embeddingProvider: strings(['openai', 'anthropic']),
  embeddingModel: strings(['text-embedding-3-small', 'text-embedding-3-large']),
  searchHistoryRetention: strings(['off', 'session', '7-days', '30-days', 'forever', 'weekly']),
  scrollbarVisibility: strings(['auto', 'always', 'visible']),
  fontFamily: strings(['geist', 'system', 'ibm-plex', 'papyrus']),
  colorMode: strings(['system', 'light', 'dark', 'sepia']),
  ticketLinkBase: strings([
    '',
    'https://example.com',
    'http://example.com',
    'https://u:p@example.com',
    'not a url',
    ' https://x.com',
    `https://example.com/${'a'.repeat(300)}`
  ]),
  pullRequestLinkBase: strings([
    '',
    'https://github.com/example/repo/pull/',
    'ftp://example.com',
    'javascript:alert(1)'
  ]),
  anthropicKey: strings(['k', ' k ', 'synthetic-key-value', '\t']),
  openaiKey: strings(['k', ' k ', 'synthetic-key-value', '\n']),
  geminiKey: strings(['k', ' k ', 'synthetic-key-value']),
  deleteProviderKeys: [
    [],
    ['openai'],
    ['anthropic', 'gemini'],
    ['bogus'],
    ['openai', 'openai'],
    ['openai', 5],
    'openai',
    ...junk
  ]
}
const keys = Object.keys(pools)

const legacyAccepts = (patch: Record<string, unknown>): boolean => {
  try {
    assertValidSettingsPatch(patch)
    return true
  } catch {
    return false
  }
}

// Split each pool by what the old validator says about that value alone, so most generated patches are valid.
const good: Record<string, unknown[]> = {}
for (const key of keys) {
  good[key] = (pools[key] as unknown[]).filter((value) => legacyAccepts({ [key]: value }))
}

function generate(random: () => number): Record<string, unknown> {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T
  const patch: Record<string, unknown> = {}
  const count = 1 + Math.floor(random() * 5)
  for (let i = 0; i < count; i += 1) {
    const key = pick(keys)
    const source = random() < 0.85 && (good[key] as unknown[]).length > 0 ? good[key] : pools[key]
    patch[key] = pick(source as unknown[])
  }
  // Now and then add an unknown key.
  if (random() < 0.1) patch[pick(['arbitrary', 'constructor', 'toString', 'colormode'])] = 1
  return patch
}

const legacy = (patch: Record<string, unknown>): { accepted: boolean; output?: unknown } => {
  try {
    return { accepted: true, output: assertValidSettingsPatch(patch) }
  } catch {
    return { accepted: false }
  }
}

describe('the new settings patch schema against the old validator, on generated patches', () => {
  it('accepts and rejects the same patches with the same parsed value', () => {
    const random = mulberry32(20261102)
    let accepted = 0
    const mismatches: string[] = []

    for (let i = 0; i < 4000; i += 1) {
      const patch = generate(random)
      const old = legacy(patch)
      const next = save.input.safeParse(patch)
      if (old.accepted) accepted += 1
      if (old.accepted !== next.success) {
        mismatches.push(
          `case ${i}: legacy ${old.accepted}, new ${next.success}: ${JSON.stringify(patch)}`
        )
      } else if (next.success) {
        try {
          expect(next.data).toStrictEqual(old.output)
        } catch {
          mismatches.push(`case ${i}: parsed value differs: ${JSON.stringify(patch)}`)
        }
      }
    }

    expect(mismatches.slice(0, 5)).toEqual([])
    // The generator must reach both outcomes in volume, or the comparison proves little.
    expect(accepted).toBeGreaterThan(1200)
    expect(accepted).toBeLessThan(3400)
  })

  it('accepts and rejects the same provider values', () => {
    const values = [
      ...junk,
      'anthropic',
      'openai',
      'gemini',
      'bogus',
      'OpenAI',
      ' openai',
      'openai\0'
    ]
    for (const value of values) {
      let accepted = true
      try {
        assertValidProviderId(value)
      } catch {
        accepted = false
      }
      expect(validateKey.input.safeParse({ provider: value }).success, String(value)).toBe(accepted)
    }
  })
})
