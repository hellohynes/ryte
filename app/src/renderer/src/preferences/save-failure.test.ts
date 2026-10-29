import { describe, expect, it } from 'vitest'
import { isReactive } from 'vue'

import { createSaveFailures } from './save-failure'

describe('save failures', () => {
  it('turns a failed save into a notice that remembers what was being saved, and bumps the revision', async () => {
    const saves = createSaveFailures(async () => {
      throw new Error('Keychain is locked')
    })

    expect(await saves.commit({ fontFamily: 'roboto' })).toBe(false)

    expect(saves.failure.value).toEqual({
      message: 'Keychain is locked',
      patch: { fontFamily: 'roboto' }
    })
    expect(saves.revision.value).toBe(1)
  })

  it('leaves no notice after a save that works', async () => {
    const saves = createSaveFailures(async () => undefined)

    expect(await saves.commit({ fontFamily: 'roboto' })).toBe(true)

    expect(saves.failure.value).toBeNull()
    expect(saves.revision.value).toBe(0)
  })

  it('dismisses the notice when Retry is pressed, then saves the same patch again', async () => {
    const attempts: unknown[] = []
    let failNext = true
    const noticeWhileSaving: Array<unknown> = []
    const saves = createSaveFailures(async (patch) => {
      attempts.push(patch)
      noticeWhileSaving.push(saves.failure.value)
      if (failNext) {
        failNext = false
        throw new Error('offline')
      }
    })
    await saves.commit({ colorMode: 'dark' })
    expect(saves.failure.value).not.toBeNull()

    expect(await saves.retry()).toBe(true)

    expect(attempts).toEqual([{ colorMode: 'dark' }, { colorMode: 'dark' }])
    // The notice was already gone while the second attempt ran, and stays gone once it worked.
    expect(noticeWhileSaving[1]).toBeNull()
    expect(saves.failure.value).toBeNull()
  })

  it('retries with a plain patch, because a reactive proxy cannot be sent over IPC', async () => {
    const seen: unknown[] = []
    let failNext = true
    const saves = createSaveFailures(async (patch) => {
      seen.push(patch)
      if (failNext) {
        failNext = false
        throw new Error('offline')
      }
    })
    await saves.commit({ fontFamily: 'roboto' })

    await saves.retry()

    expect(seen).toHaveLength(2)
    expect(isReactive(seen[1])).toBe(false)
    expect(seen[1]).toEqual({ fontFamily: 'roboto' })
  })

  it('shows a fresh notice when the retry fails too', async () => {
    const saves = createSaveFailures(async () => {
      throw new Error('still offline')
    })
    await saves.commit({ scrollbarVisibility: 'always' })

    expect(await saves.retry()).toBe(false)

    expect(saves.failure.value?.message).toBe('still offline')
    expect(saves.revision.value).toBe(2)
  })

  it('does nothing when there is no notice to retry', async () => {
    let calls = 0
    const saves = createSaveFailures(async () => {
      calls += 1
    })

    expect(await saves.retry()).toBe(true)
    expect(calls).toBe(0)
  })

  it('keeps the notice when a save of a different setting works', async () => {
    let fail = true
    const saves = createSaveFailures(async () => {
      if (fail) throw new Error('nope')
    })
    await saves.commit({ fontFamily: 'lora' })
    fail = false

    await saves.commit({ colorMode: 'light' })

    expect(saves.failure.value).toEqual({ message: 'nope', patch: { fontFamily: 'lora' } })
  })

  it('clears the notice when the same setting is saved again, by hand or by retry', async () => {
    let fail = true
    const saves = createSaveFailures(async () => {
      if (fail) throw new Error('nope')
    })
    await saves.commit({ fontFamily: 'lora' })
    fail = false

    await saves.commit({ fontFamily: 'geist' })

    expect(saves.failure.value).toBeNull()
  })

  it('shows the latest failure only, so Retry never replays an older change', async () => {
    const attempts: unknown[] = []
    let fail = true
    const saves = createSaveFailures(async (patch) => {
      attempts.push(patch)
      if (fail) throw new Error(`failed ${Object.keys(patch)[0]}`)
    })
    await saves.commit({ fontFamily: 'lora' })
    await saves.commit({ colorMode: 'light' })

    expect(saves.failure.value).toEqual({
      message: 'failed colorMode',
      patch: { colorMode: 'light' }
    })

    fail = false
    await saves.retry()

    expect(attempts.at(-1)).toEqual({ colorMode: 'light' })
    expect(saves.failure.value).toBeNull()
  })

  it('drops the whole notice when a later save touches any setting it holds', async () => {
    let fail = true
    const saves = createSaveFailures(async () => {
      if (fail) throw new Error('nope')
    })
    // A vendor change writes two settings; the reader then picks a model, which writes one of them.
    await saves.commit({ answerProvider: 'anthropic', answerModel: 'claude-haiku-4-5' })
    fail = false

    await saves.commit({ answerModel: 'gpt-5.2' })

    expect(saves.failure.value).toBeNull()
  })

  it('drops the notice when a key is saved or removed, since that changes what else is valid', async () => {
    for (const keyPatch of [
      { openaiKey: 'sk-test' },
      { anthropicKey: 'sk-ant' },
      { deleteProviderKeys: ['openai' as const] }
    ]) {
      let fail = true
      const saves = createSaveFailures(async () => {
        if (fail) throw new Error('nope')
      })
      await saves.commit({ semanticIndexEnabled: true })
      fail = false

      await saves.commit(keyPatch)

      expect(saves.failure.value, JSON.stringify(keyPatch)).toBeNull()
    }
  })

  describe('when the window closes', () => {
    const SECRET = 'sk-typed-by-the-reader-0000'

    function failing(): ReturnType<typeof createSaveFailures> & { attempts: unknown[] } {
      const attempts: unknown[] = []
      const saves = createSaveFailures(async (patch) => {
        attempts.push(patch)
        throw new Error('Keychain is locked')
      })
      return Object.assign(saves, { attempts })
    }

    it('wipes a failed key from memory but keeps the notice, so the failure is not hidden', async () => {
      const saves = failing()
      await saves.commit({ openaiKey: SECRET, answerProvider: 'openai' })

      saves.seal()

      const failure = saves.failure.value
      expect(failure).toMatchObject({ message: 'Keychain is locked', keyLost: true, patch: {} })
      expect(JSON.stringify(failure)).not.toContain(SECRET)
    })

    it('has nothing to retry once the key is gone, and does not save anything', async () => {
      const saves = failing()
      await saves.commit({ anthropicKey: SECRET })
      saves.seal()
      saves.attempts.length = 0

      expect(await saves.retry()).toBe(false)

      expect(saves.attempts).toEqual([])
      expect(saves.failure.value?.keyLost).toBe(true)
    })

    it('wipes a key whose save only fails after the window has closed', async () => {
      const saves = failing()
      saves.seal()

      await saves.commit({ openaiKey: SECRET })

      expect(saves.failure.value).toMatchObject({ keyLost: true, patch: {} })
      expect(JSON.stringify(saves.failure.value)).not.toContain(SECRET)
    })

    it('leaves a failure that holds no key retryable', async () => {
      const saves = failing()
      await saves.commit({ fontFamily: 'lora' })

      saves.seal()

      expect(saves.failure.value).toEqual({
        message: 'Keychain is locked',
        patch: { fontFamily: 'lora' }
      })
      expect(saves.failure.value?.keyLost).toBeUndefined()
    })

    it('keeps a key while the window is open, so Retry can save it', async () => {
      const saves = failing()
      saves.seal()
      saves.unseal()

      await saves.commit({ openaiKey: SECRET })

      expect(saves.failure.value).toMatchObject({ patch: { openaiKey: SECRET } })
      expect(saves.failure.value?.keyLost).toBeUndefined()
    })

    it('can be dismissed, and a saved key clears it too', async () => {
      const saves = failing()
      await saves.commit({ openaiKey: SECRET })
      saves.seal()

      saves.dismiss()
      expect(saves.failure.value).toBeNull()

      let fail = true
      const again = createSaveFailures(async () => {
        if (fail) throw new Error('nope')
      })
      again.seal()
      await again.commit({ openaiKey: SECRET })
      fail = false
      await again.commit({ openaiKey: SECRET })
      expect(again.failure.value).toBeNull()
    })
  })
})
