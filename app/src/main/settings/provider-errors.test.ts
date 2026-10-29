import { describe, expect, it } from 'vitest'

import { describeProviderError, redactKeyFragments } from './provider-errors'

describe('redactKeyFragments', () => {
  it('redacts the masked key a provider echoes back, keeping the rest of the message', () => {
    expect(
      redactKeyFragments(
        '401 Incorrect API key provided: sk-proj-********************abcd. You can find your key at https://platform.openai.com/account/api-keys.'
      )
    ).toBe(
      '401 Incorrect API key provided: [redacted key] You can find your key at https://platform.openai.com/account/api-keys.'
    )
  })

  it('redacts other key shapes', () => {
    expect(redactKeyFragments('bad key sk-...abcd')).toBe('bad key [redacted key]')
    expect(redactKeyFragments('bad key sk-ant-api03-AbCdEf123456')).toBe('bad key [redacted key]')
  })

  it('redacts the exact saved key wherever it appears, whatever its shape', () => {
    expect(
      redactKeyFragments('rejected token-1234567890 twice token-1234567890', 'token-1234567890')
    ).toBe('rejected [redacted key] twice [redacted key]')
  })

  it('leaves messages without a key alone', () => {
    expect(redactKeyFragments('The model `gpt-9` does not exist')).toBe(
      'The model `gpt-9` does not exist'
    )
  })
})

describe('describeProviderError', () => {
  it('uses the error message, scrubbed', () => {
    expect(describeProviderError(new Error('Incorrect API key provided: sk-proj-****abcd'))).toBe(
      'Incorrect API key provided: [redacted key]'
    )
  })

  it('handles non-Error values', () => {
    expect(describeProviderError('plain text failure')).toBe('plain text failure')
    expect(describeProviderError(undefined)).toBe('The provider returned an error.')
  })
})
