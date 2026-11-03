import { describe, expect, it } from 'vitest'

import { rebuildNotice } from './rebuild-notice'

describe('rebuildNotice', () => {
  it('tells a keyword-only user that the index is being rebuilt, that search may be incomplete, and that notes are unchanged', () => {
    const { message, detail } = rebuildNotice({ cloud: false })

    expect(message).toMatch(/rebuilding its search index/i)
    expect(detail).toMatch(/rebuilding it now/i)
    expect(detail).toMatch(/search may be incomplete/i)
    expect(detail).toMatch(/notes are not changed/i)
  })

  it('does not mention a provider, the internet or a retry to a keyword-only user', () => {
    const { message, detail } = rebuildNotice({ cloud: false })

    expect(`${message} ${detail}`).not.toMatch(
      /openai|internet|send|sent|rebuild index in preferences/i
    )
  })

  it('also tells a cloud user that the notes will be sent again, that it needs a connection, and how to retry', () => {
    const { detail } = rebuildNotice({ cloud: true })

    expect(detail).toMatch(/search may be incomplete/i)
    expect(detail).toMatch(/notes will be sent to OpenAI again/i)
    expect(detail).toMatch(/internet connection/i)
    expect(detail).toMatch(/Rebuild index in Preferences, under Content/)
  })

  it.each([false, true])('names no path, no folder and no key (cloud: %s)', (cloud) => {
    const { message, detail } = rebuildNotice({ cloud })

    expect(`${message} ${detail}`).not.toMatch(/\/|\\|sk-|\.md|~/)
  })
})
