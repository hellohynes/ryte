import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { createContractApi } from '../preload/contract-api'
import { ContractInputError, parseOperationInput } from './define'
import { manifest } from './manifest.generated'
import { requestId, searchQuery } from './primitives'
import {
  cancel,
  checkSnapshotFreshness,
  citation,
  done,
  error,
  notice,
  query,
  search,
  searchAnswerMode,
  searchRetrievalMode,
  sources,
  stage,
  streamToken
} from './search'

const legacyChannels = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../../scripts/legacy.json', import.meta.url)), 'utf8')
  ) as { channels: { request: string[]; event: string[] } }
).channels

const valid = {
  query: 'jira plans',
  retrievalMode: 'keyword',
  generatedAt: 100,
  sourcePaths: ['plans/jira.md']
}

const accepts = (input: unknown): boolean => checkSnapshotFreshness.input.safeParse(input).success

describe('search.checkSnapshotFreshness', () => {
  it('keeps the wire channel name', () => {
    expect(checkSnapshotFreshness.channel).toBe('search:check-snapshot-freshness')
    expect(manifest.search.operations.checkSnapshotFreshness).toBe(
      'search:check-snapshot-freshness'
    )
  })

  it('validates its example against its own schemas', () => {
    expect(
      checkSnapshotFreshness.input.safeParse(checkSnapshotFreshness.example.input).success
    ).toBe(true)
    expect(
      checkSnapshotFreshness.output.safeParse(checkSnapshotFreshness.example.output).success
    ).toBe(true)
  })

  it('is called as window.ryte.search.checkSnapshotFreshness with one argument', () => {
    const invoked: unknown[][] = []
    const api = createContractApi<Record<string, Record<string, unknown>>>(
      {
        invoke: async (...args) => void invoked.push(args),
        on: () => undefined,
        removeListener: () => undefined
      },
      manifest
    )
    ;(api.search.checkSnapshotFreshness as (...args: unknown[]) => unknown)(valid, 'ignored')
    expect(invoked).toEqual([['search:check-snapshot-freshness', valid]])
  })

  it('hands the handler the trimmed query and the paths with repeats dropped, first kept', () => {
    expect(
      parseOperationInput('search.checkSnapshotFreshness', checkSnapshotFreshness.input, {
        query: '  jira plans \n',
        retrievalMode: 'hybrid',
        generatedAt: 0,
        sourcePaths: ['b.md', 'a.md', 'b.md', 'c.md', 'a.md']
      })
    ).toStrictEqual({
      query: 'jira plans',
      retrievalMode: 'hybrid',
      generatedAt: 0,
      sourcePaths: ['b.md', 'a.md', 'c.md']
    })
  })

  it('refuses a stray key, a missing key and an explicit undefined', () => {
    expect(accepts(valid)).toBe(true)
    expect(accepts({ ...valid, extra: 1 })).toBe(false)
    for (const key of Object.keys(valid)) {
      const rest = Object.fromEntries(Object.entries(valid).filter(([name]) => name !== key))
      expect(accepts(rest), `without ${key}`).toBe(false)
      expect(accepts({ ...valid, [key]: undefined }), `${key} undefined`).toBe(false)
    }
    expect(accepts(undefined)).toBe(false)
    expect(accepts(null)).toBe(false)
    expect(accepts([valid])).toBe(false)
  })

  it('takes the three retrieval modes and nothing else', () => {
    for (const mode of ['auto', 'keyword', 'hybrid']) {
      expect(accepts({ ...valid, retrievalMode: mode }), mode).toBe(true)
    }
    for (const mode of ['Auto', '', 'semantic', 'local-only', 1, null]) {
      expect(accepts({ ...valid, retrievalMode: mode }), String(mode)).toBe(false)
    }
    expect(searchRetrievalMode.options).toEqual(['auto', 'keyword', 'hybrid'])
  })

  it('takes a finite generatedAt of zero or more', () => {
    for (const generatedAt of [0, -0, 1.5, 1767312000000, Number.MAX_VALUE]) {
      expect(accepts({ ...valid, generatedAt }), String(generatedAt)).toBe(true)
    }
    for (const generatedAt of [-1, -0.5, Number.NaN, Infinity, -Infinity, '100', null, 10n]) {
      expect(accepts({ ...valid, generatedAt }), String(generatedAt)).toBe(false)
    }
  })

  it('takes at most 100 paths, each 1 to 4096 characters, and counts them before dropping repeats', () => {
    const names = (count: number): string[] => Array.from({ length: count }, (_, i) => `n${i}.md`)
    expect(accepts({ ...valid, sourcePaths: [] })).toBe(true)
    expect(accepts({ ...valid, sourcePaths: names(100) })).toBe(true)
    expect(accepts({ ...valid, sourcePaths: names(101) })).toBe(false)
    expect(accepts({ ...valid, sourcePaths: Array.from({ length: 101 }, () => 'a.md') })).toBe(
      false
    )
    expect(accepts({ ...valid, sourcePaths: [''] })).toBe(false)
    expect(accepts({ ...valid, sourcePaths: ['p'.repeat(4096)] })).toBe(true)
    expect(accepts({ ...valid, sourcePaths: ['p'.repeat(4097)] })).toBe(false)
    expect(accepts({ ...valid, sourcePaths: ['a.md', 5] })).toBe(false)
    expect(accepts({ ...valid, sourcePaths: 'a.md' })).toBe(false)
  })

  it('keeps the paths as sent, without normalizing them', () => {
    const sourcePaths = ['./a.md', 'a.md', '../b.md', '/abs/c.md']
    expect(
      parseOperationInput('search.checkSnapshotFreshness', checkSnapshotFreshness.input, {
        ...valid,
        sourcePaths
      })
    ).toMatchObject({ sourcePaths })
  })

  it('names the operation and the fields, never a value, when an input is rejected', () => {
    const secret = 'secret-folder'
    for (const input of [
      { ...valid, query: ' ' },
      { ...valid, [secret]: 1 },
      { ...valid, retrievalMode: secret },
      { ...valid, sourcePaths: [`${secret}`, ''] },
      { ...valid, generatedAt: -1 }
    ]) {
      let thrown: unknown
      try {
        parseOperationInput('search.checkSnapshotFreshness', checkSnapshotFreshness.input, input)
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(ContractInputError)
      expect(
        (thrown as Error).message.startsWith('Invalid search.checkSnapshotFreshness input')
      ).toBe(true)
      expect((thrown as Error).message).not.toMatch(/secret/)
    }
  })

  it('describes the result the service returns', () => {
    const output = checkSnapshotFreshness.output
    expect(
      output.safeParse({ state: 'current', changedSourcePaths: [], relevantSourcePaths: [] })
        .success
    ).toBe(true)
    expect(
      output.safeParse({
        state: 'updates-available',
        changedSourcePaths: ['a.md'],
        relevantSourcePaths: ['a.md']
      }).success
    ).toBe(true)
    expect(
      output.safeParse({ state: 'stale', changedSourcePaths: [], relevantSourcePaths: [] }).success
    ).toBe(false)
    expect(output.safeParse({ state: 'current', changedSourcePaths: [] }).success).toBe(false)
  })
})

describe('the search query rule', () => {
  it('trims, then takes 1 to 2000 characters of what is left', () => {
    expect(searchQuery.parse('  a ')).toBe('a')
    expect(searchQuery.parse(` ${'q'.repeat(2000)} `)).toBe('q'.repeat(2000))
    expect(searchQuery.safeParse('q'.repeat(2001)).success).toBe(false)
    expect(searchQuery.safeParse(' \t\n').success).toBe(false)
    expect(searchQuery.safeParse('').success).toBe(false)
    expect(searchQuery.safeParse(5).success).toBe(false)
    expect(searchQuery.safeParse(undefined).success).toBe(false)
  })
})

// An event definition carries its payload as optional; every search event has one.
function schemaOf<TSchema>(event: { payload?: TSchema }): TSchema {
  if (!event.payload) throw new Error('This event has no payload schema')
  return event.payload
}

const REQUEST_ID = '3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f'

describe('the search area', () => {
  it('has all three operations and the seven events, and nothing left on the legacy list', () => {
    expect(Object.keys(search.operations)).toEqual(['query', 'cancel', 'checkSnapshotFreshness'])
    expect(Object.keys(search.events)).toEqual([
      'stage',
      'streamToken',
      'sources',
      'citation',
      'notice',
      'done',
      'error'
    ])
    expect(legacyChannels.request).toEqual([])
    expect(legacyChannels.event).toEqual([])
  })

  it('keeps every wire channel name', () => {
    expect(manifest.search.operations).toEqual({
      query: 'search:query',
      cancel: 'search:cancel',
      checkSnapshotFreshness: 'search:check-snapshot-freshness'
    })
    expect(manifest.search.events).toEqual({
      stage: 'search:stage',
      streamToken: 'search:stream-token',
      sources: 'search:sources',
      citation: 'search:citation',
      notice: 'search:notice',
      done: 'search:done',
      error: 'search:error'
    })
    expect([query, cancel].map((operation) => operation.channel)).toEqual([
      'search:query',
      'search:cancel'
    ])
    expect(
      [stage, streamToken, sources, citation, notice, done, error].map((event) => event.channel)
    ).toEqual([
      'search:stage',
      'search:stream-token',
      'search:sources',
      'search:citation',
      'search:notice',
      'search:done',
      'search:error'
    ])
  })

  it('gives window.ryte.search exactly these names, with the token subscriber called onStreamToken', () => {
    const subscribed: string[] = []
    const invoked: unknown[][] = []
    const api = createContractApi<Record<string, Record<string, unknown>>>(
      {
        invoke: async (...args) => void invoked.push(args),
        on: (channel) => void subscribed.push(channel),
        removeListener: () => undefined
      },
      manifest
    )
    expect(Object.keys(api.search).sort()).toEqual([
      'cancel',
      'checkSnapshotFreshness',
      'onCitation',
      'onDone',
      'onError',
      'onNotice',
      'onSources',
      'onStage',
      'onStreamToken',
      'query'
    ])

    for (const name of [
      'onStage',
      'onStreamToken',
      'onSources',
      'onCitation',
      'onNotice',
      'onDone',
      'onError'
    ]) {
      ;(api.search[name] as (callback: () => void) => unknown)(() => undefined)
    }
    expect(subscribed).toEqual([
      'search:stage',
      'search:stream-token',
      'search:sources',
      'search:citation',
      'search:notice',
      'search:done',
      'search:error'
    ])

    // One argument is forwarded, as before for a no-options query; a stray second one is dropped.
    ;(api.search.query as (...args: unknown[]) => unknown)({ query: 'q' }, 'ignored')
    ;(api.search.cancel as (...args: unknown[]) => unknown)({ requestId: REQUEST_ID }, 'ignored')
    expect(invoked).toEqual([
      ['search:query', { query: 'q' }],
      ['search:cancel', { requestId: REQUEST_ID }]
    ])
  })

  it('delivers one object per event to the listener, as the payload came', () => {
    const listeners = new Map<string, (event: unknown, ...payload: unknown[]) => void>()
    const api = createContractApi<Record<string, Record<string, unknown>>>(
      {
        invoke: async () => undefined,
        on: (channel, listener) => void listeners.set(channel, listener),
        removeListener: () => undefined
      },
      manifest
    )
    const received: unknown[][] = []
    ;(api.search.onStage as (callback: (...args: unknown[]) => void) => unknown)((...args) =>
      received.push(args)
    )

    listeners.get('search:stage')?.({}, { requestId: 'r', stage: 'searching-local' })

    expect(received).toEqual([[{ requestId: 'r', stage: 'searching-local' }]])
  })
})

describe('search.query', () => {
  const accepts = (input: unknown): boolean => query.input.safeParse(input).success

  it('validates its example against its own schemas', () => {
    expect(query.input.safeParse(query.example.input).success).toBe(true)
    expect(query.output.safeParse(query.example.output).success).toBe(true)
  })

  it('takes one object with the query and the two optional modes, and nothing else', () => {
    expect(accepts({ query: 'q' })).toBe(true)
    expect(accepts({ query: 'q', retrievalMode: 'hybrid' })).toBe(true)
    expect(accepts({ query: 'q', answerMode: 'local-only' })).toBe(true)
    expect(accepts({ query: 'q', retrievalMode: 'auto', answerMode: 'settings' })).toBe(true)
    expect(accepts({})).toBe(false)
    expect(accepts({ query: 'q', extra: 1 })).toBe(false)
    expect(accepts('q')).toBe(false)
    expect(accepts(undefined)).toBe(false)
    expect(accepts(null)).toBe(false)
    expect(accepts([{ query: 'q' }])).toBe(false)
  })

  it('refuses an optional key sent as undefined, and a null', () => {
    expect(accepts({ query: 'q', retrievalMode: undefined })).toBe(false)
    expect(accepts({ query: 'q', answerMode: undefined })).toBe(false)
    expect(accepts({ query: undefined })).toBe(false)
    expect(accepts({ query: 'q', retrievalMode: null })).toBe(false)
    expect(accepts({ query: 'q', answerMode: null })).toBe(false)
  })

  it('takes the three retrieval modes and the two answer modes, and nothing else', () => {
    expect(searchRetrievalMode.options).toEqual(['auto', 'keyword', 'hybrid'])
    expect(searchAnswerMode.options).toEqual(['settings', 'local-only'])
    for (const mode of ['Auto', '', 'semantic', 'local-only', 1]) {
      expect(accepts({ query: 'q', retrievalMode: mode }), String(mode)).toBe(false)
    }
    for (const mode of ['Settings', '', 'cloud', 'keyword', 1]) {
      expect(accepts({ query: 'q', answerMode: mode }), String(mode)).toBe(false)
    }
  })

  it('hands the handler the trimmed query and only the options that were sent', () => {
    expect(
      parseOperationInput('search.query', query.input, { query: '  jira plans \n' })
    ).toStrictEqual({ query: 'jira plans' })
    expect(
      parseOperationInput('search.query', query.input, {
        query: ' q ',
        answerMode: 'local-only',
        retrievalMode: 'keyword'
      })
    ).toStrictEqual({ query: 'q', answerMode: 'local-only', retrievalMode: 'keyword' })
  })

  it('takes a trimmed query of 1 to 2000 characters', () => {
    expect(accepts({ query: 'q'.repeat(2000) })).toBe(true)
    expect(accepts({ query: ` ${'q'.repeat(2000)} ` })).toBe(true)
    expect(accepts({ query: 'q'.repeat(2001) })).toBe(false)
    expect(accepts({ query: '   ' })).toBe(false)
    expect(accepts({ query: '' })).toBe(false)
  })

  it('returns an id or null', () => {
    expect(query.output.safeParse(REQUEST_ID).success).toBe(true)
    expect(query.output.safeParse(null).success).toBe(true)
    expect(query.output.safeParse(undefined).success).toBe(false)
    expect(query.output.safeParse(5).success).toBe(false)
  })

  it('names the operation and the fields, never a value, when an input is rejected', () => {
    let thrown: unknown
    try {
      parseOperationInput('search.query', query.input, { query: ' ', secret: 'secret-folder' })
    } catch (caught) {
      thrown = caught
    }
    expect(thrown).toBeInstanceOf(ContractInputError)
    expect((thrown as Error).message.startsWith('Invalid search.query input')).toBe(true)
    expect((thrown as Error).message).not.toMatch(/secret/)
  })
})

describe('search.cancel', () => {
  const accepts = (input: unknown): boolean => cancel.input.safeParse(input).success

  it('validates its example against its own schemas', () => {
    expect(cancel.input.safeParse(cancel.example.input).success).toBe(true)
    expect(cancel.output.safeParse(cancel.example.output).success).toBe(true)
  })

  it('takes an object with a request id, and nothing else', () => {
    expect(accepts({ requestId: REQUEST_ID })).toBe(true)
    expect(accepts({})).toBe(false)
    expect(accepts({ requestId: REQUEST_ID, extra: 1 })).toBe(false)
    expect(accepts({ requestId: undefined })).toBe(false)
    expect(accepts(REQUEST_ID)).toBe(false)
    expect(accepts(undefined)).toBe(false)
  })

  it('takes a UUID of version 1 to 5 and variant 8, 9, a or b, in either case', () => {
    const make = (version: string, variant: string): string =>
      `3f9c1d2e-7a4b-${version}c8e-${variant}d1f-0a2b3c4d5e6f`
    for (const version of ['1', '2', '3', '4', '5']) {
      for (const variant of ['8', '9', 'a', 'b']) {
        expect(requestId.safeParse(make(version, variant)).success, `${version}${variant}`).toBe(
          true
        )
        expect(requestId.safeParse(make(version, variant).toUpperCase()).success).toBe(true)
      }
    }
    for (const version of ['0', '6', '7', 'f']) {
      expect(requestId.safeParse(make(version, '8')).success, `version ${version}`).toBe(false)
    }
    for (const variant of ['0', '7', 'c', 'f']) {
      expect(requestId.safeParse(make('4', variant)).success, `variant ${variant}`).toBe(false)
    }
    for (const bad of [
      '',
      `${REQUEST_ID}\n`,
      ` ${REQUEST_ID}`,
      REQUEST_ID.replaceAll('-', ''),
      `{${REQUEST_ID}}`,
      REQUEST_ID.slice(1),
      `${REQUEST_ID}0`,
      5,
      null,
      undefined
    ]) {
      expect(requestId.safeParse(bad).success, String(bad)).toBe(false)
    }
  })

  it('resolves to nothing', () => {
    expect(cancel.output.safeParse(undefined).success).toBe(true)
  })
})

// The payloads the old events carried (`sendSearchEvent` and the old preload types at 1bffddd), by event, so a field
// that was sent before cannot be dropped from the schema without this test saying so. The citation was sent flat.
const OLD_PAYLOAD_FIELDS = [
  [stage, ['requestId', 'stage']],
  [streamToken, ['requestId', 'token']],
  [sources, ['requestId', 'sources']],
  [citation, ['requestId', 'index', 'sourcePath', 'headingPath']],
  [notice, ['requestId', 'notice']],
  [done, ['requestId']],
  [error, ['requestId', 'error']]
] as const

const SOURCE = {
  index: 1,
  sourcePath: 'plans/a.md',
  headingPath: ['Plan'],
  preview: 'a preview',
  matchCount: 2,
  retrievalMode: 'keyword'
}

const PAYLOADS = {
  stage: { requestId: REQUEST_ID, stage: 'gathering-evidence' },
  streamToken: { requestId: REQUEST_ID, token: 'a token' },
  sources: { requestId: REQUEST_ID, sources: [SOURCE, { ...SOURCE, retrievalMode: 'hybrid' }] },
  citation: { requestId: REQUEST_ID, index: 1, sourcePath: 'plans/a.md', headingPath: ['Plan'] },
  notice: {
    requestId: REQUEST_ID,
    notice: { code: 'provider-key-missing', message: 'No key is saved.' }
  },
  done: { requestId: REQUEST_ID },
  error: { requestId: REQUEST_ID, error: 'The index closed.' }
} as const

describe('the search events', () => {
  const byKey = { stage, streamToken, sources, citation, notice, done, error }
  const parses = (key: keyof typeof byKey, payload: unknown): boolean =>
    schemaOf(byKey[key]).safeParse(payload).success

  it('carry every field the old payloads carried, and each is required', () => {
    for (const [event, fields] of OLD_PAYLOAD_FIELDS) {
      expect(Object.keys(schemaOf(event).shape).sort(), event.channel).toEqual([...fields].sort())
    }
    for (const key of Object.keys(PAYLOADS) as Array<keyof typeof PAYLOADS>) {
      for (const field of Object.keys(PAYLOADS[key])) {
        const without = Object.fromEntries(
          Object.entries(PAYLOADS[key]).filter(([name]) => name !== field)
        )
        expect(parses(key, without), `${key} without ${field}`).toBe(false)
      }
    }
  })

  it('accept the payloads the main process sends', () => {
    for (const key of Object.keys(PAYLOADS) as Array<keyof typeof PAYLOADS>) {
      expect(parses(key, PAYLOADS[key]), key).toBe(true)
    }
  })

  it('send the citation flat, with its fields beside the request id', () => {
    expect(
      parses('citation', {
        requestId: REQUEST_ID,
        citation: { index: 1, sourcePath: 'a.md', headingPath: [] }
      })
    ).toBe(false)
    expect(
      parses('citation', { requestId: REQUEST_ID, index: 1, sourcePath: 'a.md', headingPath: [] })
    ).toBe(true)
  })

  it('accept an empty request id on the error event, which the not-ready answer carries', () => {
    expect(parses('error', { requestId: '', error: 'Indexer not initialized' })).toBe(true)
    // The id is a plain string on every event: the schema is not what checks it.
    for (const key of Object.keys(PAYLOADS) as Array<keyof typeof PAYLOADS>) {
      expect(parses(key, { ...PAYLOADS[key], requestId: '' }), key).toBe(true)
    }
  })

  it('refuse malformed payloads', () => {
    expect(parses('stage', { requestId: REQUEST_ID, stage: 'thinking' })).toBe(false)
    expect(parses('stage', { requestId: REQUEST_ID, stage: 1 })).toBe(false)
    expect(parses('streamToken', { requestId: REQUEST_ID, token: 5 })).toBe(false)
    expect(
      parses('sources', { requestId: REQUEST_ID, sources: [{ ...SOURCE, retrievalMode: 'auto' }] })
    ).toBe(false)
    expect(
      parses('sources', { requestId: REQUEST_ID, sources: [{ ...SOURCE, preview: undefined }] })
    ).toBe(false)
    expect(parses('sources', { requestId: REQUEST_ID, sources: {} })).toBe(false)
    expect(
      parses('notice', { requestId: REQUEST_ID, notice: { code: 'nope', message: 'm' } })
    ).toBe(false)
    expect(parses('notice', { requestId: REQUEST_ID, notice: { code: 'no-local-sources' } })).toBe(
      false
    )
    expect(parses('done', { requestId: 5 })).toBe(false)
    expect(parses('done', { requestId: REQUEST_ID, extra: 1 })).toBe(false)
    expect(parses('error', { requestId: REQUEST_ID, error: { message: 'm' } })).toBe(false)
    for (const key of Object.keys(PAYLOADS) as Array<keyof typeof PAYLOADS>) {
      expect(parses(key, undefined), key).toBe(false)
      expect(parses(key, null), key).toBe(false)
    }
  })

  it('name the five notice codes, the three stages and the two applied retrieval modes', () => {
    const noticeShape = schemaOf(notice).shape.notice.shape
    expect(noticeShape.code.options).toEqual([
      'no-local-sources',
      'semantic-unavailable',
      'cloud-answers-disabled',
      'cloud-answers-not-acknowledged',
      'provider-key-missing'
    ])
    expect(schemaOf(stage).shape.stage.options).toEqual([
      'searching-local',
      'gathering-evidence',
      'writing-summary'
    ])
    expect(schemaOf(sources).shape.sources.element.shape.retrievalMode.options).toEqual([
      'keyword',
      'hybrid'
    ])
  })
})
