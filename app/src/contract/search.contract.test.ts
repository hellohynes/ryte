import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { createContractApi } from '../preload/contract-api'
import { ContractInputError, parseOperationInput } from './define'
import { manifest } from './manifest.generated'
import { searchQuery } from './primitives'
import { checkSnapshotFreshness, search, searchRetrievalMode } from './search'

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
  it('keeps the wire channel name and is the only search operation on the contract so far', () => {
    expect(checkSnapshotFreshness.channel).toBe('search:check-snapshot-freshness')
    expect(Object.keys(search.operations)).toEqual(['checkSnapshotFreshness'])
    expect(search.events).toEqual({})
    expect(manifest.search.operations).toEqual({
      checkSnapshotFreshness: 'search:check-snapshot-freshness'
    })
    expect(manifest.search.events).toEqual({})
  })

  it('left the legacy list, and the query and cancel channels are still on it', () => {
    expect(legacyChannels.request).not.toContain(checkSnapshotFreshness.channel)
    expect(legacyChannels.request).toEqual(['search:cancel', 'search:query'])
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
    expect(Object.keys(api.search)).toEqual(['checkSnapshotFreshness'])
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
