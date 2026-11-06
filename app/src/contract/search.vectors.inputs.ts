// Golden-vector inputs for `search.checkSnapshotFreshness`, authored as real TypeScript values so that
// undefined-valued keys, own `__proto__` keys, inherited keys, sparse arrays and non-plain objects survive. The
// expected results live in `search.vectors.expected.json` and were recorded once from the pre-change validator
// (`assertValidSearchSnapshotFreshnessInput`) at 68bf229. Do not derive expectations from new code. The validator was
// deleted when the operation moved onto the registry; the recorder was a one-shot script and is not kept. The
// validator is in `68bf229:app/src/main/ipc-validation.ts`: replaying these inputs through it reproduces the
// expected file.
//
// Vector ids are written `freshness: ...` (a colon and a space) so that none is shaped like an `area:name` channel,
// which `check:contract` would report. Every path and query here is synthetic.

import { MAX_PATH_LENGTH } from '../shared/source-path'
import { shapes } from './workspace.vectors.inputs'

export type SearchVectorOp = 'freshness'

export interface SearchVector {
  id: string
  op: SearchVectorOp
  input: unknown
}

export const SEARCH_VECTOR_OPS: readonly SearchVectorOp[] = ['freshness']

const freshness = (id: string, input: unknown): SearchVector => ({
  id: `freshness: ${id}`,
  op: 'freshness',
  input
})

const jsonObject = (text: string): unknown => JSON.parse(text)

const valid = (): Record<string, unknown> => ({
  query: 'jira plans',
  retrievalMode: 'keyword',
  generatedAt: 100,
  sourcePaths: ['plans/jira.md']
})

const with_ = (changes: Record<string, unknown>): Record<string, unknown> => ({
  ...valid(),
  ...changes
})

const without = (key: string): Record<string, unknown> => {
  const input = valid()
  delete input[key]
  return input
}

class FullBoxed {
  query = 'jira plans'
  retrievalMode = 'keyword'
  generatedAt = 100
  sourcePaths = ['plans/jira.md']
}

class PathList extends Array<string> {}

const names = (count: number): string[] => Array.from({ length: count }, (_, i) => `n${i}.md`)
const pathOf = (length: number): string => `${'p'.repeat(length - 3)}.md`
const text = (length: number): string => 'q'.repeat(length)

const sparseOne = (): unknown[] => {
  const array: unknown[] = []
  array[1] = 'a.md'
  return array
}
const sparseTail = (): unknown[] => {
  const array: unknown[] = ['a.md']
  array.length = 3
  return array
}
const withExtraProperty = (): unknown[] => {
  const array = ['a.md'] as string[] & { extra?: string }
  array.extra = 'x'
  return array
}

const RETRIEVAL_MODE_CASES: [string, unknown][] = [
  ['auto', 'auto'],
  ['keyword', 'keyword'],
  ['hybrid', 'hybrid'],
  ['upper-case auto', 'AUTO'],
  ['capitalized keyword', 'Keyword'],
  ['empty', ''],
  ['leading space', ' auto'],
  ['trailing space', 'auto '],
  ['trailing newline', 'auto\n'],
  ['semantic', 'semantic'],
  ['an answer mode', 'local-only'],
  ['settings', 'settings'],
  ['number', 1],
  ['boolean', true],
  ['null', null],
  ['explicit undefined', undefined],
  ['array', ['auto']],
  ['object', { mode: 'auto' }],
  ['String object', new String('auto')]
]

const GENERATED_AT_CASES: [string, unknown][] = [
  ['zero', 0],
  ['negative zero', -0],
  ['one', 1],
  ['a float', 1.5],
  ['a timestamp', 1767312000000],
  ['one past 2^53', 2 ** 53 + 2],
  ['Number.MAX_VALUE', Number.MAX_VALUE],
  ['Number.MIN_VALUE', Number.MIN_VALUE],
  ['1e21', 1e21],
  ['negative one', -1],
  ['negative fraction', -0.5],
  ['negative MIN_VALUE', -Number.MIN_VALUE],
  ['negative infinity', Number.NEGATIVE_INFINITY],
  ['NaN', Number.NaN],
  ['infinity', Number.POSITIVE_INFINITY],
  ['numeric string', '100'],
  ['empty string', ''],
  ['null', null],
  ['explicit undefined', undefined],
  ['boolean', true],
  ['bigint', 10n],
  ['array', [100]],
  ['object', { valueOf: () => 100 }],
  ['Number object', new Number(5)]
]

const SOURCE_PATHS_CASES: [string, unknown][] = [
  ['no entries', []],
  ['one entry', ['a.md']],
  ['100 entries', names(100)],
  ['101 entries', names(101)],
  ['100 copies of one path', Array.from({ length: 100 }, () => 'a.md')],
  ['101 copies of one path', Array.from({ length: 101 }, () => 'a.md')],
  ['duplicates keep the first occurrence order', ['b.md', 'a.md', 'b.md', 'c.md', 'a.md']],
  ['adjacent duplicates', ['a.md', 'a.md', 'b.md', 'b.md']],
  ['same file under two spellings', ['a.md', './a.md', 'docs//a.md', 'docs/a.md']],
  ['absolute path is not normalized', ['/etc/a.md']],
  ['parent traversal is not normalized', ['../a.md']],
  ['NUL is not rejected', ['a\0.md']],
  ['backslash', ['docs\\a.md']],
  ['not markdown', ['docs/a.txt']],
  ['empty entry', ['']],
  ['valid entry then empty entry', ['a.md', '']],
  ['whitespace entry', [' ']],
  [`entry of ${MAX_PATH_LENGTH} characters`, [pathOf(MAX_PATH_LENGTH)]],
  [`entry of ${MAX_PATH_LENGTH + 1} characters`, [pathOf(MAX_PATH_LENGTH + 1)]],
  [`${MAX_PATH_LENGTH} characters twice`, [pathOf(MAX_PATH_LENGTH), pathOf(MAX_PATH_LENGTH)]],
  ['number entry', ['a.md', 5]],
  ['null entry', ['a.md', null]],
  ['explicit undefined entry', ['a.md', undefined]],
  ['array entry', [['a.md']]],
  ['object entry', [{ sourcePath: 'a.md' }]],
  ['String object entry', [new String('a.md')]],
  ['sparse array with a hole', sparseOne()],
  ['sparse array with a trailing hole', sparseTail()],
  ['only holes', new Array(3)],
  ['array with an extra own property', withExtraProperty()],
  ['Array subclass', PathList.from(['a.md'])],
  ['string', 'a.md'],
  ['empty string', ''],
  ['null', null],
  ['explicit undefined', undefined],
  ['number', 1],
  ['array-like object', { length: 1, 0: 'a.md' }],
  ['Set', new Set(['a.md'])],
  ['object', {}]
]

const QUERY_CASES: [string, unknown][] = [
  ['typical', 'jira plans'],
  ['empty', ''],
  ['one space', ' '],
  ['whitespace only', ' \t\r\n '],
  ['one character', 'a'],
  ['2000 characters', text(2000)],
  ['2001 characters', text(2001)],
  ['2000 characters with leading space', ` ${text(2000)}`],
  ['2000 characters padded both sides to over 2000', `  ${text(2000)}   `],
  ['2001 characters padded both sides', ` ${text(2001)} `],
  ['trimmed to one character', '\n\tz \r'],
  ['interior whitespace is kept', ' a  b\tc\nd '],
  ['unicode', 'café 日本語'],
  ['1000 emoji (2000 units)', '😀'.repeat(1000)],
  ['1001 emoji (2002 units)', '😀'.repeat(1001)],
  ['no-break space is trimmed', ' x '],
  ['byte order mark is trimmed', '﻿x'],
  ['line separator is trimmed', ' x '],
  ['zero-width space is not trimmed', '​'],
  ['zero-width space beside text', '​x'],
  ['NUL', '\0'],
  ['NUL beside text', 'a\0b'],
  ['number', 5],
  ['boolean', true],
  ['null', null],
  ['explicit undefined', undefined],
  ['array', ['a']],
  ['object', { q: 'a' }],
  ['String object', new String('q')]
]

export const searchVectors: SearchVector[] = [
  // ---- shapes of the input itself. The shared shapes carry one valid key, so those with an own valid key are not a
  // complete input and are rejected; the complete ones follow.
  ...shapes(freshness, 'query', 'jira plans'),
  freshness('array holding a valid input', [valid()]),
  freshness('empty string', ''),
  freshness('zero', 0),
  freshness('function', () => valid()),
  freshness('valid input', valid()),
  freshness('class instance with valid own fields', new FullBoxed()),
  freshness(
    'null-prototype object with valid keys',
    Object.assign(Object.create(null), valid()) as unknown
  ),
  freshness('symbol key beside valid keys is ignored', { [Symbol('s')]: 1, ...valid() }),
  freshness(
    'own __proto__ key with valid keys',
    jsonObject(
      '{"__proto__":{"x":1},"query":"jira plans","retrievalMode":"keyword","generatedAt":100,"sourcePaths":["plans/jira.md"]}'
    )
  ),
  freshness('every key inherited', Object.create(valid())),
  freshness(
    'query inherited beside three own keys',
    Object.assign(Object.create({ query: 'jira plans' }), without('query'))
  ),
  freshness(
    'sourcePaths inherited beside three own keys',
    Object.assign(Object.create({ sourcePaths: ['a.md'] }), without('sourcePaths'))
  ),
  freshness(
    'valid own keys beside an inherited unknown key',
    Object.assign(Object.create({ arbitrary: 1 }), valid())
  ),
  freshness(
    'valid own keys beside an inherited valid key',
    Object.assign(Object.create({ query: 'other' }), valid())
  ),

  // ---- the key set
  freshness('valid input with an unknown key', with_({ extra: 1 })),
  freshness('valid input with an explicit undefined unknown key', with_({ extra: undefined })),
  freshness('valid input with a constructor key', with_({ constructor: 1 })),
  freshness('valid input with a toString key', with_({ toString: 'x' })),
  freshness('valid input with an answerMode key', with_({ answerMode: 'local-only' })),
  freshness('valid input with a requestId key', with_({ requestId: 'r' })),
  freshness('valid input with a case-different key', with_({ Query: 'x' })),
  freshness('query missing', without('query')),
  freshness('retrievalMode missing', without('retrievalMode')),
  freshness('generatedAt missing', without('generatedAt')),
  freshness('sourcePaths missing', without('sourcePaths')),
  freshness('only query', { query: 'jira plans' }),

  // ---- explicit undefined, one key at a time
  freshness('query explicit undefined key', with_({ query: undefined })),
  freshness('retrievalMode explicit undefined key', with_({ retrievalMode: undefined })),
  freshness('generatedAt explicit undefined key', with_({ generatedAt: undefined })),
  freshness('sourcePaths explicit undefined key', with_({ sourcePaths: undefined })),
  freshness('every key explicit undefined', {
    query: undefined,
    retrievalMode: undefined,
    generatedAt: undefined,
    sourcePaths: undefined
  }),

  // ---- null, one key at a time
  freshness('query null key', with_({ query: null })),
  freshness('retrievalMode null key', with_({ retrievalMode: null })),
  freshness('generatedAt null key', with_({ generatedAt: null })),
  freshness('sourcePaths null key', with_({ sourcePaths: null })),

  // ---- retrievalMode
  ...RETRIEVAL_MODE_CASES.map(([name, value]) =>
    freshness(`retrievalMode ${name}`, with_({ retrievalMode: value }))
  ),

  // ---- generatedAt
  ...GENERATED_AT_CASES.map(([name, value]) =>
    freshness(`generatedAt ${name}`, with_({ generatedAt: value }))
  ),

  // ---- sourcePaths
  ...SOURCE_PATHS_CASES.map(([name, value]) =>
    freshness(`sourcePaths ${name}`, with_({ sourcePaths: value }))
  ),

  // ---- query, trimmed last
  ...QUERY_CASES.map(([name, value]) => freshness(`query ${name}`, with_({ query: value }))),

  // ---- a bad value in one key beside a bad query: both reject, whichever the old code checked first
  freshness(
    'invalid query and invalid retrievalMode',
    with_({ query: '', retrievalMode: 'semantic' })
  ),
  freshness('valid query and invalid generatedAt', with_({ generatedAt: -1 })),
  freshness(
    'trimmed query with duplicate paths',
    with_({ query: '  jira plans  ', sourcePaths: ['b.md', 'a.md', 'b.md'] })
  ),
  freshness(
    'every value at its limit',
    with_({
      query: ` ${text(2000)} `,
      retrievalMode: 'hybrid',
      generatedAt: 0,
      sourcePaths: names(100)
    })
  )
]
