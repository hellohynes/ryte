import { describe, expect, it } from 'vitest'

import { isOwnPageMove } from './page-moves'

const ID = 'a'.repeat(32)

describe('moving between pages', () => {
  it('allows another page beside it and refuses another folder or id', () => {
    expect(isOwnPageMove(`ryte-page://${ID}/details.html`, ID)).toBe(true)
    expect(isOwnPageMove(`ryte-page://${ID}/more/page.htm`, ID)).toBe(true)

    expect(isOwnPageMove(`ryte-page://${'b'.repeat(32)}/details.html`, ID)).toBe(false)
    expect(isOwnPageMove(`ryte-page://${ID}/../other/index.html`, ID)).toBe(false)
    expect(isOwnPageMove(`ryte-page://${ID}/%2e%2e/other/index.html`, ID)).toBe(false)
    expect(isOwnPageMove(`ryte-page://${ID}/media/shot.png`, ID)).toBe(false)
    expect(isOwnPageMove('https://example.com/details.html', ID)).toBe(false)
    expect(isOwnPageMove('ryte-file://notes/details.html', ID)).toBe(false)
  })
})
