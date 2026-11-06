// Golden-vector inputs for the three rules `search.query` and `search.cancel` took over from hand-written validators:
// the query text (`assertValidSearchQuery`), the options argument (`assertValidSearchOptions`) and the request id
// (`assertValidRequestId`). Authored as real TypeScript values so that undefined-valued keys, own `__proto__` keys,
// inherited keys and non-plain objects survive. The expected results live in `search.query.vectors.expected.json`
// and were recorded once from those validators at 1bffddd. Do not derive expectations from new code. The validators
// were deleted when the operations moved onto the registry; the recorder was a one-shot script and is not kept. They
// are in `1bffddd:app/src/main/ipc-validation.ts`: replaying these inputs through them reproduces the expected file.
//
// The old call was `query(q, options)`; the new input is one object, so the replay maps each options value to
// `{ query, ...options }` (see `search.query.vectors.test.ts`).
//
// Vector ids are written `searchQuery: ...` (a colon and a space) so that none is shaped like an `area:name`
// channel, which `check:contract` would report. Every value here is synthetic.

export type SearchQueryVectorOp = 'searchQuery' | 'searchOptions' | 'requestId'

export interface SearchQueryVector {
  id: string
  op: SearchQueryVectorOp
  input: unknown
}

export const SEARCH_QUERY_VECTOR_OPS: readonly SearchQueryVectorOp[] = [
  'searchQuery',
  'searchOptions',
  'requestId'
]

const make =
  (op: SearchQueryVectorOp) =>
  (id: string, input: unknown): SearchQueryVector => ({ id: `${op}: ${id}`, op, input })

const searchQuery = make('searchQuery')
const searchOptions = make('searchOptions')
const requestId = make('requestId')

const jsonObject = (text: string): unknown => JSON.parse(text)
const text = (length: number): string => 'q'.repeat(length)

// ---- the query text

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
  ['trailing newline', 'jira plans\n'],
  ['unicode', 'café 日本語'],
  ['1000 emoji (2000 units)', '😀'.repeat(1000)],
  ['1001 emoji (2002 units)', '😀'.repeat(1001)],
  ['no-break space is trimmed', ' x '],
  ['byte order mark is trimmed', '﻿x'],
  ['line separator is trimmed', ' x '],
  ['zero-width space is not trimmed', '​'],
  ['zero-width space beside text', '​x'],
  ['NUL', '\0'],
  ['NUL beside text', 'a\0b'],
  ['number', 5],
  ['zero', 0],
  ['boolean', true],
  ['bigint', 10n],
  ['null', null],
  ['explicit undefined', undefined],
  ['array', ['a']],
  ['array of one string', ['jira plans']],
  ['object', { q: 'a' }],
  ['String object', new String('q')],
  ['function', () => 'q']
]

// ---- the options argument

class FullOptions {
  retrievalMode = 'keyword'
  answerMode = 'local-only'
}

class WithMethod {
  retrievalMode = 'auto'
  describe(): string {
    return 'x'
  }
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

const ANSWER_MODE_CASES: [string, unknown][] = [
  ['settings', 'settings'],
  ['local-only', 'local-only'],
  ['upper-case settings', 'SETTINGS'],
  ['capitalized local-only', 'Local-only'],
  ['local only with a space', 'local only'],
  ['local_only', 'local_only'],
  ['empty', ''],
  ['leading space', ' settings'],
  ['trailing newline', 'settings\n'],
  ['cloud', 'cloud'],
  ['a retrieval mode', 'keyword'],
  ['number', 1],
  ['boolean', false],
  ['null', null],
  ['explicit undefined', undefined],
  ['array', ['settings']],
  ['object', { mode: 'settings' }],
  ['String object', new String('settings')]
]

// ---- the request id

const HEX = '0123456789abcdef'
const group = (length: number, fill = 'a'): string => fill.repeat(length)
const uuid = (version: string, variant: string): string =>
  `${group(8)}-${group(4, '1')}-${version}${group(3, '2')}-${variant}${group(3, '3')}-${group(12, '4')}`

const REQUEST_ID_CASES: [string, unknown][] = [
  ['typical v4', '3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f'],
  ['upper-case v4', '3F9C1D2E-7A4B-4C8E-9D1F-0A2B3C4D5E6F'],
  ['mixed-case v4', '3f9C1d2E-7a4B-4c8E-9d1F-0a2B3c4D5e6F'],
  ['nil uuid', '00000000-0000-0000-0000-000000000000'],
  ['max uuid', 'ffffffff-ffff-ffff-ffff-ffffffffffff'],
  // Every version, in both cases, against every variant nibble.
  ...(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'].flatMap(
    (version): [string, unknown][] => [
      [`version ${version}`, uuid(version, '8')],
      [`version ${version} upper-case`, uuid(version, '8').toUpperCase()]
    ]
  ) as [string, unknown][]),
  ...(HEX.split('').flatMap((variant): [string, unknown][] => [
    [`variant ${variant}`, uuid('4', variant)],
    [`variant ${variant} upper-case`, uuid('4', variant).toUpperCase()]
  ]) as [string, unknown][]),
  ['version 1 variant 8', uuid('1', '8')],
  ['version 5 variant b', uuid('5', 'b')],
  ['version 5 variant 9 upper-case', uuid('5', '9').toUpperCase()],
  ['empty', ''],
  ['one character short', '3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6'],
  ['one character long', '3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f0'],
  ['no hyphens', '3f9c1d2e7a4b4c8e9d1f0a2b3c4d5e6f'],
  ['one hyphen missing', '3f9c1d2e7a4b-4c8e-9d1f-0a2b3c4d5e6f'],
  ['groups regrouped', '3f9c1d2e7-a4b-4c8e-9d1f-0a2b3c4d5e6f'],
  ['braces', '{3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f}'],
  ['urn prefix', 'urn:uuid:3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f'],
  ['non-hex character', '3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6g'],
  ['leading space', ' 3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f'],
  ['trailing space', '3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f '],
  ['trailing newline', '3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f\n'],
  ['leading newline', '\n3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f'],
  [
    'two ids on two lines',
    '3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f\n3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f'
  ],
  ['NUL at the end', '3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f\0'],
  ['full-width digit', '3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6７'],
  ['an empty request id as the not-ready error carries', ''],
  ['number', 5],
  ['boolean', true],
  ['bigint', 10n],
  ['null', null],
  ['explicit undefined', undefined],
  ['array holding a valid id', ['3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f']],
  ['object', { requestId: '3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f' }],
  ['String object', new String('3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f')],
  [
    'object with a toString that returns a valid id',
    { toString: () => '3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f' }
  ],
  ['function', () => '3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f'],
  ['symbol', Symbol('id')]
]

export const searchQueryVectors: SearchQueryVector[] = [
  ...QUERY_CASES.map(([name, value]) => searchQuery(name, value)),

  // ---- options: the value itself
  searchOptions('undefined', undefined),
  searchOptions('null', null),
  searchOptions('empty object', {}),
  searchOptions('retrievalMode only, keyword', { retrievalMode: 'keyword' }),
  searchOptions('answerMode only, local-only', { answerMode: 'local-only' }),
  searchOptions('both valid', { retrievalMode: 'hybrid', answerMode: 'settings' }),
  searchOptions('both valid, answerMode first', {
    answerMode: 'local-only',
    retrievalMode: 'auto'
  }),
  searchOptions('empty array', []),
  searchOptions('array holding valid options', [{ retrievalMode: 'keyword' }]),
  searchOptions('string', 'keyword'),
  searchOptions('empty string', ''),
  searchOptions('number', 1),
  searchOptions('zero', 0),
  searchOptions('boolean true', true),
  searchOptions('boolean false', false),
  searchOptions('bigint', 1n),
  searchOptions('symbol', Symbol('options')),
  searchOptions('function', () => ({ retrievalMode: 'keyword' })),
  searchOptions('String object', new String('keyword')),
  searchOptions('Date instance', new Date(0)),
  searchOptions('Map', new Map([['retrievalMode', 'keyword']])),
  searchOptions('class instance with valid own fields', new FullOptions()),
  searchOptions('class instance with a method on the prototype', new WithMethod()),
  searchOptions(
    'null-prototype object with valid keys',
    Object.assign(Object.create(null), {
      retrievalMode: 'hybrid',
      answerMode: 'settings'
    }) as unknown
  ),
  searchOptions('null-prototype empty object', Object.create(null) as unknown),
  searchOptions('symbol key beside valid keys is ignored', {
    [Symbol('s')]: 1,
    retrievalMode: 'keyword'
  }),
  searchOptions('symbol key only', { [Symbol('s')]: 1 }),
  searchOptions('own __proto__ key', jsonObject('{"__proto__":{"retrievalMode":"keyword"}}')),
  searchOptions(
    'own __proto__ key beside valid keys',
    jsonObject('{"__proto__":{"x":1},"retrievalMode":"keyword"}')
  ),
  searchOptions('inherited retrievalMode only', Object.create({ retrievalMode: 'keyword' })),
  searchOptions(
    'inherited valid keys beside one own valid key',
    Object.assign(Object.create({ answerMode: 'local-only' }), { retrievalMode: 'auto' })
  ),
  searchOptions(
    'inherited invalid retrievalMode only',
    Object.create({ retrievalMode: 'semantic' })
  ),
  searchOptions('inherited unknown key only', Object.create({ arbitrary: 1 })),
  searchOptions(
    'own valid key beside an inherited unknown key',
    Object.assign(Object.create({ arbitrary: 1 }), { retrievalMode: 'keyword' })
  ),

  // ---- options: the key set
  searchOptions('unknown key', { extra: 1 }),
  searchOptions('valid key with an unknown key', { retrievalMode: 'keyword', extra: 1 }),
  searchOptions('unknown key with an explicit undefined value', { extra: undefined }),
  searchOptions('query key', { query: 'jira plans' }),
  searchOptions('requestId key', { requestId: 'r' }),
  searchOptions('constructor key', { constructor: 1 }),
  searchOptions('toString key', { toString: 'x' }),
  searchOptions('case-different key', { RetrievalMode: 'keyword' }),
  searchOptions('retrievalMode explicit undefined key', { retrievalMode: undefined }),
  searchOptions('answerMode explicit undefined key', { answerMode: undefined }),
  searchOptions('both keys explicit undefined', {
    retrievalMode: undefined,
    answerMode: undefined
  }),
  searchOptions('valid retrievalMode with answerMode explicit undefined', {
    retrievalMode: 'keyword',
    answerMode: undefined
  }),
  searchOptions('valid answerMode with retrievalMode explicit undefined', {
    retrievalMode: undefined,
    answerMode: 'settings'
  }),
  searchOptions('retrievalMode null key', { retrievalMode: null }),
  searchOptions('answerMode null key', { answerMode: null }),

  // ---- options: each value, beside a valid other key
  ...RETRIEVAL_MODE_CASES.map(([name, value]) =>
    searchOptions(`retrievalMode ${name}`, { retrievalMode: value })
  ),
  ...ANSWER_MODE_CASES.map(([name, value]) =>
    searchOptions(`answerMode ${name}`, { answerMode: value })
  ),
  searchOptions('invalid retrievalMode beside a valid answerMode', {
    retrievalMode: 'semantic',
    answerMode: 'settings'
  }),
  searchOptions('valid retrievalMode beside an invalid answerMode', {
    retrievalMode: 'keyword',
    answerMode: 'cloud'
  }),
  searchOptions('both invalid', { retrievalMode: 'semantic', answerMode: 'cloud' }),

  // ---- the request id
  ...REQUEST_ID_CASES.map(([name, value]) => requestId(name, value))
]
