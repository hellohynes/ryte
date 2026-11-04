// Golden-vector inputs for the state-only `workspace` operations, authored as real TypeScript values so that NaN,
// Infinity, undefined-valued keys, own `__proto__` keys, inherited keys and non-plain objects survive. The expected
// results live in `workspace.vectors.expected.json` and were recorded once from the pre-change validators
// (`assertValidWorkspaceShellPatch`, `...LibraryPatch`, `...FocusTabInput`, `...CloseTabInput`,
// `...UpdateTabViewModeInput`, `...SetOutlineCollapsedInput` and `...SetOutlineWidthInput`). Do not derive
// expectations from new code. Those validators were deleted when the operations moved onto the registry; the
// recorder was a one-shot script and is not kept. The validators are in `ea721df:app/src/main/ipc-validation.ts`:
// replaying these inputs through them reproduces the expected file.
//
// Vector ids are written `shell: ...`, `library: ...` and so on (a colon and a space) so that none is shaped like an
// `area:name` channel, which `check:contract` would report. Every path and id here is synthetic.

import { MAX_PATH_LENGTH } from '../shared/source-path'

export type WorkspaceVectorOp =
  | 'shell'
  | 'library'
  | 'focusTab'
  | 'closeTab'
  | 'viewMode'
  | 'outlineCollapsed'
  | 'outlineWidth'

export interface WorkspaceVector {
  id: string
  op: WorkspaceVectorOp
  input: unknown
}

export const WORKSPACE_VECTOR_OPS: readonly WorkspaceVectorOp[] = [
  'shell',
  'library',
  'focusTab',
  'closeTab',
  'viewMode',
  'outlineCollapsed',
  'outlineWidth'
]

export const SHELL_KEYS = ['sidebarCollapsed', 'sidebarWidth', 'activeSidebar'] as const
export const LIBRARY_KEYS = ['expandedFolders', 'scrollTop', 'folderSortModes'] as const

const make =
  (op: WorkspaceVectorOp) =>
  (id: string, input: unknown): WorkspaceVector => ({ id: `${op}: ${id}`, op, input })

/** A one-key object. */
const one = (key: string, value: unknown): Record<string, unknown> => ({ [key]: value })

const jsonObject = (text: string): unknown => JSON.parse(text)

class Boxed {
  tabId = 'tab-1'
}

const sparse = (): unknown[] => {
  const array: unknown[] = []
  array[1] = 'docs'
  return array
}

const shell = make('shell')
const library = make('library')
const focusTab = make('focusTab')
const closeTab = make('closeTab')
const viewMode = make('viewMode')
const outlineCollapsed = make('outlineCollapsed')
const outlineWidth = make('outlineWidth')

/** The shapes every object input is tried with, so each operation proves it takes an object and nothing else. */
const shapes = (
  maker: (id: string, input: unknown) => WorkspaceVector,
  validOwnKey: string,
  validOwnValue: unknown
): WorkspaceVector[] => [
  maker('empty object', {}),
  maker('undefined', undefined),
  maker('null', null),
  maker('string', 'tab-1'),
  maker('number', 5),
  maker('boolean', true),
  maker('empty array', []),
  maker('array holding an object', [one(validOwnKey, validOwnValue)]),
  maker('Date instance', new Date(0)),
  maker('Map instance', new Map()),
  maker('class instance with a valid own field', new Boxed()),
  maker(
    'null-prototype object with a valid key',
    Object.assign(Object.create(null), one(validOwnKey, validOwnValue))
  ),
  maker('symbol key is ignored', { [Symbol('s')]: 1, ...one(validOwnKey, validOwnValue) }),
  maker('only an unknown key', { arbitrary: true }),
  maker('valid key with an unknown key', { ...one(validOwnKey, validOwnValue), arbitrary: true }),
  maker('constructor as a key', { constructor: 1 }),
  maker('toString as a key', { toString: 'x' }),
  maker('own __proto__ key', jsonObject('{"__proto__":{"x":1}}')),
  maker(
    'own __proto__ key with a valid key',
    jsonObject(
      `{"__proto__":{"x":1},${JSON.stringify(validOwnKey)}:${JSON.stringify(validOwnValue)}}`
    )
  ),
  maker('inherited valid key only', Object.create(one(validOwnKey, validOwnValue))),
  maker('inherited unknown key only', Object.create({ arbitrary: true }))
]

const SHELL_VALID_VALUES: Record<(typeof SHELL_KEYS)[number], unknown> = {
  sidebarCollapsed: true,
  sidebarWidth: 360,
  activeSidebar: 'files'
}

const LIBRARY_VALID_VALUES: Record<(typeof LIBRARY_KEYS)[number], unknown> = {
  expandedFolders: ['docs'],
  scrollTop: 10,
  folderSortModes: { docs: 'za' }
}

const longPath = (length: number): string => `${'a'.repeat(length - 3)}.md`
const tabId = (length: number): string => `a${'b'.repeat(length - 1)}`

const TAB_ID_CASES: [string, unknown][] = [
  ['typical uuid', '3f2b8c1e-5d4a-4b9e-8f10-1234567890ab'],
  ['one character', 'a'],
  ['digit first', '1'],
  ['200 characters', tabId(200)],
  ['201 characters', tabId(201)],
  ['allowed punctuation', 'a:b_c.d-e'],
  ['dot first', '.a'],
  ['dash first', '-a'],
  ['underscore first', '_a'],
  ['colon first', ':a'],
  ['empty', ''],
  ['space inside', 'a b'],
  ['leading space', ' a'],
  ['trailing space', 'a '],
  ['trailing newline', 'a\n'],
  ['leading newline', '\na'],
  ['embedded newline', 'a\nb'],
  ['slash', 'a/b'],
  ['backslash', 'a\\b'],
  ['NUL', 'a\0b'],
  ['NUL only', '\0'],
  ['unicode letter', 'é'],
  ['unicode inside', 'aé'],
  ['full-width digit', '１'],
  ['percent', 'a%20b'],
  ['dot dot', '..'],
  ['number', 5],
  ['boolean', true],
  ['null', null],
  ['array', ['a']],
  ['object', {}],
  ['NaN', Number.NaN],
  ['String object', new String('a')]
]

export const workspaceVectors: WorkspaceVector[] = [
  // ---- shell patch
  ...shapes(shell, 'sidebarCollapsed', true),
  shell('every key valid at once', SHELL_VALID_VALUES),
  shell('two valid keys', { sidebarCollapsed: false, sidebarWidth: 200 }),
  shell('valid key with an invalid key', { sidebarCollapsed: true, sidebarWidth: -1 }),
  shell(
    'inherited valid key beside an own key',
    Object.assign(Object.create({ sidebarWidth: 200 }), { sidebarCollapsed: true })
  ),
  shell('inherited invalid key only', Object.create({ sidebarWidth: -5 })),
  ...SHELL_KEYS.map((key) => shell(`${key} explicit undefined`, one(key, undefined))),
  shell('sidebarCollapsed true', one('sidebarCollapsed', true)),
  shell('sidebarCollapsed false', one('sidebarCollapsed', false)),
  shell('sidebarCollapsed string', one('sidebarCollapsed', 'true')),
  shell('sidebarCollapsed number 1', one('sidebarCollapsed', 1)),
  shell('sidebarCollapsed number 0', one('sidebarCollapsed', 0)),
  shell('sidebarCollapsed null', one('sidebarCollapsed', null)),
  shell('sidebarCollapsed NaN', one('sidebarCollapsed', Number.NaN)),
  shell('sidebarCollapsed Boolean object', one('sidebarCollapsed', new Boolean(true))),
  shell('sidebarWidth typical', one('sidebarWidth', 360)),
  shell('sidebarWidth fractional', one('sidebarWidth', 360.5)),
  shell('sidebarWidth tiny positive', one('sidebarWidth', Number.MIN_VALUE)),
  shell('sidebarWidth 1', one('sidebarWidth', 1)),
  shell('sidebarWidth 4000', one('sidebarWidth', 4000)),
  shell('sidebarWidth 4000.5', one('sidebarWidth', 4000.5)),
  shell('sidebarWidth 4001', one('sidebarWidth', 4001)),
  shell('sidebarWidth 0', one('sidebarWidth', 0)),
  shell('sidebarWidth negative zero', one('sidebarWidth', -0)),
  shell('sidebarWidth negative', one('sidebarWidth', -1)),
  shell('sidebarWidth NaN', one('sidebarWidth', Number.NaN)),
  shell('sidebarWidth Infinity', one('sidebarWidth', Number.POSITIVE_INFINITY)),
  shell('sidebarWidth negative Infinity', one('sidebarWidth', Number.NEGATIVE_INFINITY)),
  shell('sidebarWidth numeric string', one('sidebarWidth', '360')),
  shell('sidebarWidth null', one('sidebarWidth', null)),
  shell('sidebarWidth bigint', one('sidebarWidth', 360n)),
  shell('sidebarWidth Number object', one('sidebarWidth', new Number(360))),
  shell('activeSidebar files', one('activeSidebar', 'files')),
  shell('activeSidebar unknown', one('activeSidebar', 'settings')),
  shell('activeSidebar different case', one('activeSidebar', 'Files')),
  shell('activeSidebar padded', one('activeSidebar', ' files')),
  shell('activeSidebar empty', one('activeSidebar', '')),
  shell('activeSidebar null', one('activeSidebar', null)),
  shell('activeSidebar number', one('activeSidebar', 1)),
  shell('activeSidebar array', one('activeSidebar', ['files'])),

  // ---- library patch
  ...shapes(library, 'scrollTop', 10),
  library('every key valid at once', LIBRARY_VALID_VALUES),
  library('two valid keys', { scrollTop: 0, expandedFolders: [] }),
  library('valid key with an invalid key', { scrollTop: 5, expandedFolders: '../x' }),
  library(
    'inherited valid key beside an own key',
    Object.assign(Object.create({ scrollTop: 3 }), { expandedFolders: [] })
  ),
  library('inherited invalid key only', Object.create({ scrollTop: -3 })),
  ...LIBRARY_KEYS.map((key) => library(`${key} explicit undefined`, one(key, undefined))),
  // expandedFolders
  library('expandedFolders empty', one('expandedFolders', [])),
  library('expandedFolders typical', one('expandedFolders', ['docs', 'sessions/2026-07-02/plans'])),
  library('expandedFolders dot-slash is normalized', one('expandedFolders', ['./docs'])),
  library(
    'expandedFolders redundant separators are normalized',
    one('expandedFolders', ['docs//plans/./a'])
  ),
  library('expandedFolders trailing slash is normalized', one('expandedFolders', ['docs/'])),
  library(
    'expandedFolders duplicates are kept',
    one('expandedFolders', ['docs', 'docs', './docs'])
  ),
  library(
    'expandedFolders 1000 entries',
    one(
      'expandedFolders',
      Array.from({ length: 1000 }, (_, i) => `d${i}`)
    )
  ),
  library('expandedFolders parent traversal', one('expandedFolders', ['../escape'])),
  library('expandedFolders traversal in the middle', one('expandedFolders', ['a/../b'])),
  library('expandedFolders backslash traversal', one('expandedFolders', ['a\\..\\b'])),
  library('expandedFolders absolute', one('expandedFolders', ['/etc'])),
  library('expandedFolders windows drive', one('expandedFolders', ['C:\\Notes'])),
  library('expandedFolders windows rooted', one('expandedFolders', ['\\Notes'])),
  library('expandedFolders dot only', one('expandedFolders', ['.'])),
  library('expandedFolders dot slash only', one('expandedFolders', ['./'])),
  library('expandedFolders empty string entry', one('expandedFolders', [''])),
  library('expandedFolders NUL entry', one('expandedFolders', ['a\0b'])),
  library(
    `expandedFolders entry at ${MAX_PATH_LENGTH} characters`,
    one('expandedFolders', [longPath(MAX_PATH_LENGTH)])
  ),
  library(
    `expandedFolders entry at ${MAX_PATH_LENGTH + 1} characters`,
    one('expandedFolders', [longPath(MAX_PATH_LENGTH + 1)])
  ),
  library('expandedFolders valid then invalid entry', one('expandedFolders', ['docs', '../x'])),
  library('expandedFolders number entry', one('expandedFolders', ['docs', 5])),
  library('expandedFolders null entry', one('expandedFolders', ['docs', null])),
  library('expandedFolders undefined entry', one('expandedFolders', ['docs', undefined])),
  library('expandedFolders sparse', one('expandedFolders', sparse())),
  library('expandedFolders string', one('expandedFolders', 'docs')),
  library('expandedFolders null', one('expandedFolders', null)),
  library('expandedFolders object', one('expandedFolders', { 0: 'docs', length: 1 })),
  library('expandedFolders Set', one('expandedFolders', new Set(['docs']))),
  // scrollTop
  library('scrollTop zero', one('scrollTop', 0)),
  library('scrollTop negative zero', one('scrollTop', -0)),
  library('scrollTop fractional', one('scrollTop', 10.75)),
  library('scrollTop large', one('scrollTop', 1e12)),
  library('scrollTop max safe integer', one('scrollTop', Number.MAX_SAFE_INTEGER)),
  library('scrollTop max value', one('scrollTop', Number.MAX_VALUE)),
  library('scrollTop negative', one('scrollTop', -1)),
  library('scrollTop tiny negative', one('scrollTop', -Number.MIN_VALUE)),
  library('scrollTop NaN', one('scrollTop', Number.NaN)),
  library('scrollTop Infinity', one('scrollTop', Number.POSITIVE_INFINITY)),
  library('scrollTop negative Infinity', one('scrollTop', Number.NEGATIVE_INFINITY)),
  library('scrollTop numeric string', one('scrollTop', '10')),
  library('scrollTop null', one('scrollTop', null)),
  library('scrollTop bigint', one('scrollTop', 10n)),
  // folderSortModes
  library('folderSortModes empty', one('folderSortModes', {})),
  library(
    'folderSortModes typical',
    one('folderSortModes', { docs: 'za', sessions: 'recency', notes: 'az' })
  ),
  library(
    'folderSortModes dot-slash key is normalized',
    one('folderSortModes', { './docs': 'za' })
  ),
  library(
    'folderSortModes trailing slash key is normalized',
    one('folderSortModes', { 'docs/': 'za' })
  ),
  library(
    'folderSortModes two keys that normalize alike',
    one('folderSortModes', { docs: 'za', './docs': 'recency' })
  ),
  library('folderSortModes nested key', one('folderSortModes', { 'sessions/2026-07-02': 'za' })),
  library('folderSortModes backslash key', one('folderSortModes', { 'a\\b': 'za' })),
  library('folderSortModes traversal key', one('folderSortModes', { '..': 'za' })),
  library('folderSortModes parent key', one('folderSortModes', { '../x': 'za' })),
  library('folderSortModes absolute key', one('folderSortModes', { '/etc': 'za' })),
  library('folderSortModes empty key', one('folderSortModes', { '': 'za' })),
  library('folderSortModes dot key', one('folderSortModes', { '.': 'za' })),
  library('folderSortModes NUL key', one('folderSortModes', { 'a\0b': 'za' })),
  library('folderSortModes unicode key', one('folderSortModes', { 日本語: 'za' })),
  library(
    `folderSortModes key at ${MAX_PATH_LENGTH} characters`,
    one('folderSortModes', { [longPath(MAX_PATH_LENGTH)]: 'za' })
  ),
  library(
    `folderSortModes key at ${MAX_PATH_LENGTH + 1} characters`,
    one('folderSortModes', { [longPath(MAX_PATH_LENGTH + 1)]: 'za' })
  ),
  library('folderSortModes unknown mode', one('folderSortModes', { docs: 'newest' })),
  library('folderSortModes different case mode', one('folderSortModes', { docs: 'ZA' })),
  library('folderSortModes null mode', one('folderSortModes', { docs: null })),
  library('folderSortModes undefined mode', one('folderSortModes', { docs: undefined })),
  library('folderSortModes number mode', one('folderSortModes', { docs: 1 })),
  library(
    'folderSortModes valid then invalid mode',
    one('folderSortModes', { docs: 'za', notes: 'x' })
  ),
  library(
    'folderSortModes own __proto__ key',
    one('folderSortModes', jsonObject('{"__proto__":"za"}'))
  ),
  library(
    'folderSortModes own __proto__ key with an invalid mode',
    one('folderSortModes', jsonObject('{"__proto__":"x"}'))
  ),
  library('folderSortModes constructor key', one('folderSortModes', { constructor: 'za' })),
  library(
    'folderSortModes null-prototype object',
    one('folderSortModes', Object.assign(Object.create(null), { docs: 'za' }))
  ),
  library(
    'folderSortModes inherited key only',
    one('folderSortModes', Object.create({ docs: 'za' }))
  ),
  library(
    'folderSortModes symbol key is ignored',
    one('folderSortModes', { [Symbol('s')]: 'x', docs: 'za' })
  ),
  library('folderSortModes Date instance', one('folderSortModes', new Date(0))),
  library('folderSortModes Map instance', one('folderSortModes', new Map([['docs', 'za']]))),
  library('folderSortModes null', one('folderSortModes', null)),
  library('folderSortModes undefined', one('folderSortModes', undefined)),
  library('folderSortModes array', one('folderSortModes', [])),
  library('folderSortModes array of pairs', one('folderSortModes', [['docs', 'za']])),
  library('folderSortModes string', one('folderSortModes', 'za')),

  // ---- tab id: focus-tab and close-tab take the same field; update-tab-view-mode takes it with a view mode
  ...(
    [
      ['focusTab', focusTab],
      ['closeTab', closeTab]
    ] as const
  ).flatMap(([, maker]) => [
    ...shapes(maker, 'tabId', 'tab-1'),
    maker('tabId missing beside an unknown key', { arbitrary: 1 }),
    maker('tabId explicit undefined', one('tabId', undefined)),
    maker('valid tabId with an unknown key', { tabId: 'tab-1', extra: 1 }),
    maker(
      'inherited tabId beside an own unknown key',
      Object.assign(Object.create({ tabId: 'tab-1' }), { arbitrary: 1 })
    ),
    ...TAB_ID_CASES.map(([name, value]) => maker(`tabId ${name}`, one('tabId', value)))
  ]),

  // ---- update-tab-view-mode
  ...shapes(viewMode, 'tabId', 'tab-1'),
  viewMode('both fields valid, preview', { tabId: 'tab-1', viewMode: 'preview' }),
  viewMode('both fields valid, source', { tabId: 'tab-1', viewMode: 'source' }),
  viewMode('tabId only', one('tabId', 'tab-1')),
  viewMode('viewMode only', one('viewMode', 'source')),
  viewMode('tabId explicit undefined', { tabId: undefined, viewMode: 'source' }),
  viewMode('viewMode explicit undefined', { tabId: 'tab-1', viewMode: undefined }),
  viewMode('both explicit undefined', { tabId: undefined, viewMode: undefined }),
  viewMode('unknown viewMode', { tabId: 'tab-1', viewMode: 'edit' }),
  viewMode('viewMode different case', { tabId: 'tab-1', viewMode: 'Source' }),
  viewMode('viewMode padded', { tabId: 'tab-1', viewMode: 'source ' }),
  viewMode('viewMode empty', { tabId: 'tab-1', viewMode: '' }),
  viewMode('viewMode null', { tabId: 'tab-1', viewMode: null }),
  viewMode('viewMode number', { tabId: 'tab-1', viewMode: 1 }),
  viewMode('viewMode array', { tabId: 'tab-1', viewMode: ['source'] }),
  viewMode('viewMode object', { tabId: 'tab-1', viewMode: {} }),
  viewMode('valid fields with an unknown key', { tabId: 'tab-1', viewMode: 'source', extra: 1 }),
  viewMode(
    'inherited viewMode beside an own tabId',
    Object.assign(Object.create({ viewMode: 'source' }), { tabId: 'tab-1' })
  ),
  viewMode(
    'inherited tabId beside an own viewMode',
    Object.assign(Object.create({ tabId: 'tab-1' }), { viewMode: 'source' })
  ),
  ...TAB_ID_CASES.map(([name, value]) =>
    viewMode(`tabId ${name}`, { tabId: value, viewMode: 'source' })
  ),

  // ---- set-outline-collapsed
  ...shapes(outlineCollapsed, 'sourcePath', 'a.md'),
  outlineCollapsed('both fields valid, collapsed', { sourcePath: 'a.md', collapsed: true }),
  outlineCollapsed('both fields valid, expanded', { sourcePath: 'docs/a.md', collapsed: false }),
  outlineCollapsed('sourcePath only', one('sourcePath', 'a.md')),
  outlineCollapsed('collapsed only', one('collapsed', true)),
  outlineCollapsed('sourcePath explicit undefined', { sourcePath: undefined, collapsed: true }),
  outlineCollapsed('collapsed explicit undefined', { sourcePath: 'a.md', collapsed: undefined }),
  outlineCollapsed('both explicit undefined', { sourcePath: undefined, collapsed: undefined }),
  outlineCollapsed('sourcePath dot-slash is normalized', { sourcePath: './a.md', collapsed: true }),
  outlineCollapsed('sourcePath redundant separators are normalized', {
    sourcePath: 'docs//./a.md',
    collapsed: true
  }),
  outlineCollapsed('sourcePath does not need to be markdown', {
    sourcePath: 'docs',
    collapsed: true
  }),
  outlineCollapsed('sourcePath parent traversal', { sourcePath: '../a.md', collapsed: true }),
  outlineCollapsed('sourcePath traversal in the middle', {
    sourcePath: 'a/../b.md',
    collapsed: true
  }),
  outlineCollapsed('sourcePath backslash traversal', {
    sourcePath: 'a\\..\\b.md',
    collapsed: true
  }),
  outlineCollapsed('sourcePath absolute', { sourcePath: '/etc/a.md', collapsed: true }),
  outlineCollapsed('sourcePath windows drive', { sourcePath: 'C:\\Notes\\a.md', collapsed: true }),
  outlineCollapsed('sourcePath windows rooted', { sourcePath: '\\Notes\\a.md', collapsed: true }),
  outlineCollapsed('sourcePath dot only', { sourcePath: '.', collapsed: true }),
  outlineCollapsed('sourcePath dot dot', { sourcePath: '..', collapsed: true }),
  outlineCollapsed('sourcePath empty', { sourcePath: '', collapsed: true }),
  outlineCollapsed('sourcePath NUL', { sourcePath: 'a\0.md', collapsed: true }),
  outlineCollapsed(`sourcePath at ${MAX_PATH_LENGTH} characters`, {
    sourcePath: longPath(MAX_PATH_LENGTH),
    collapsed: true
  }),
  outlineCollapsed(`sourcePath at ${MAX_PATH_LENGTH + 1} characters`, {
    sourcePath: longPath(MAX_PATH_LENGTH + 1),
    collapsed: true
  }),
  outlineCollapsed('sourcePath number', { sourcePath: 5, collapsed: true }),
  outlineCollapsed('sourcePath null', { sourcePath: null, collapsed: true }),
  outlineCollapsed('sourcePath array', { sourcePath: ['a.md'], collapsed: true }),
  outlineCollapsed('sourcePath object', { sourcePath: {}, collapsed: true }),
  outlineCollapsed('sourcePath String object', { sourcePath: new String('a.md'), collapsed: true }),
  outlineCollapsed('collapsed string', { sourcePath: 'a.md', collapsed: 'true' }),
  outlineCollapsed('collapsed number 1', { sourcePath: 'a.md', collapsed: 1 }),
  outlineCollapsed('collapsed number 0', { sourcePath: 'a.md', collapsed: 0 }),
  outlineCollapsed('collapsed null', { sourcePath: 'a.md', collapsed: null }),
  outlineCollapsed('collapsed NaN', { sourcePath: 'a.md', collapsed: Number.NaN }),
  outlineCollapsed('collapsed Boolean object', {
    sourcePath: 'a.md',
    collapsed: new Boolean(true)
  }),
  outlineCollapsed('valid fields with an unknown key', {
    sourcePath: 'a.md',
    collapsed: true,
    extra: 1
  }),
  outlineCollapsed('externalPath is not a key', { externalPath: '/tmp/a.md', collapsed: true }),
  outlineCollapsed(
    'inherited collapsed beside an own sourcePath',
    Object.assign(Object.create({ collapsed: true }), { sourcePath: 'a.md' })
  ),

  // ---- set-outline-width
  ...shapes(outlineWidth, 'width', 216),
  outlineWidth('width typical', one('width', 216)),
  outlineWidth('width fractional', one('width', 216.5)),
  outlineWidth('width 1', one('width', 1)),
  outlineWidth('width tiny positive', one('width', Number.MIN_VALUE)),
  outlineWidth('width 1000', one('width', 1000)),
  outlineWidth('width 1000.5', one('width', 1000.5)),
  outlineWidth('width 1001', one('width', 1001)),
  outlineWidth('width 0', one('width', 0)),
  outlineWidth('width negative zero', one('width', -0)),
  outlineWidth('width negative', one('width', -1)),
  outlineWidth('width NaN', one('width', Number.NaN)),
  outlineWidth('width Infinity', one('width', Number.POSITIVE_INFINITY)),
  outlineWidth('width negative Infinity', one('width', Number.NEGATIVE_INFINITY)),
  outlineWidth('width numeric string', one('width', '216')),
  outlineWidth('width null', one('width', null)),
  outlineWidth('width bigint', one('width', 216n)),
  outlineWidth('width Number object', one('width', new Number(216))),
  outlineWidth('width explicit undefined', one('width', undefined)),
  outlineWidth('width missing beside an unknown key', { arbitrary: 1 }),
  outlineWidth('valid width with an unknown key', { width: 216, extra: 1 }),
  outlineWidth(
    'inherited width beside an own unknown key',
    Object.assign(Object.create({ width: 216 }), { arbitrary: 1 })
  )
]
