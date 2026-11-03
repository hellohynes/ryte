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

  it('also tells a cloud user that search works once the scan is done, that the notes will be sent again so smart search fills in, that it needs a connection, and that a failure does not stop search', () => {
    const { detail } = rebuildNotice({ cloud: true })

    expect(detail).toMatch(/search may be incomplete/i)
    expect(detail).toMatch(/search works as soon as ryte has scanned your notes/i)
    expect(detail).toMatch(/notes will be sent to OpenAI again/i)
    expect(detail).toMatch(/smart search can fill in afterwards/i)
    expect(detail).toMatch(/internet connection/i)
    expect(detail).toMatch(/search keeps working and Ryte tries again on its own/i)
    expect(detail).toMatch(/Rebuild index in Preferences, under Content/)
  })

  it.each([false, true])('names no path, no folder and no key (cloud: %s)', (cloud) => {
    const { message, detail } = rebuildNotice({ cloud })

    expect(`${message} ${detail}`).not.toMatch(/\/|\\|sk-|\.md|~/)
  })
})
