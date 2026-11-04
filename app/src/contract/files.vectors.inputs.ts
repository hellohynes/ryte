// Golden-vector inputs for the `files` operations that take an input, authored as real TypeScript values so that
// undefined-valued keys, own `__proto__` keys, inherited keys and non-plain objects survive. The expected results
// live in `files.vectors.expected.json` and were recorded once from the pre-change validators
// (`assertValidWorkspaceFileRefInput`, `assertValidFileRenameInput`, `assertValidSourceFileInput` and
// `assertValidWorkspaceTabFileInput`) at bb14ce4. Do not derive expectations from new code. The file-reference and
// rename validators were deleted when the operations moved onto the registry; the recorder was a one-shot script
// and is not kept. All four are in `bb14ce4:app/src/main/ipc-validation.ts`: replaying these inputs through them
// reproduces the expected file.
//
// Operations: `fileRef` is the input of copy-content, copy-path, show-in-finder and move-to-trash (one shared
// schema), `rename` of rename, `sourceTitle` of read-source-title and `tabFile` of read-workspace-tab.
//
// Vector ids are written `fileRef: ...`, `rename: ...` and so on (a colon and a space) so that none is shaped like
// an `area:name` channel, which `check:contract` would report. Every path and id here is synthetic.

import {
  EXTERNAL_PATH_CASES,
  SOURCE_PATH_CASES,
  TAB_ID_CASES,
  shapes
} from './workspace.vectors.inputs'

export type FilesVectorOp = 'fileRef' | 'rename' | 'sourceTitle' | 'tabFile'

export interface FilesVector {
  id: string
  op: FilesVectorOp
  input: unknown
}

export const FILES_VECTOR_OPS: readonly FilesVectorOp[] = [
  'fileRef',
  'rename',
  'sourceTitle',
  'tabFile'
]

const make =
  (op: FilesVectorOp) =>
  (id: string, input: unknown): FilesVector => ({ id: `${op}: ${id}`, op, input })

const one = (key: string, value: unknown): Record<string, unknown> => ({ [key]: value })

const fileRef = make('fileRef')
const rename = make('rename')
const sourceTitle = make('sourceTitle')
const tabFile = make('tabFile')

const withName = (input: Record<string, unknown>): Record<string, unknown> => ({
  ...input,
  name: 'b.md'
})

/** A file name of exactly `length` characters that ends in `.md`. */
const fileName = (length: number): string => `${'n'.repeat(length - 3)}.md`

/**
 * Names the rename rule decides on: non-empty, at most 255 characters, not `.` or `..`, no slash, backslash or NUL,
 * and a `.md` extension in any case. `extname` is what counts, so a hidden `.md` file has no extension.
 */
const NAME_CASES: [string, unknown][] = [
  ['typical', 'b.md'],
  ['upper-case extension', 'B.MD'],
  ['mixed-case extension', 'b.Md'],
  ['with spaces', 'my note.md'],
  ['unicode', '日本語メモ.md'],
  ['accented', 'é.md'],
  ['double extension ending in md', 'a.txt.md'],
  ['starts with a dot', '.a.md'],
  ['dots before the extension', '..md'],
  ['hidden file named md', '.md'],
  ['md twice', '.md.md'],
  ['255 characters', fileName(255)],
  ['256 characters', fileName(256)],
  ['one character before the extension', 'a.md'],
  ['no extension', 'b'],
  ['other extension', 'b.txt'],
  ['md in the middle', 'b.md.txt'],
  ['md without a dot', 'bmd'],
  ['trailing space after the extension', 'b.md '],
  ['trailing newline after the extension', 'b.md\n'],
  ['space before the extension', 'b .md'],
  ['trailing dot', 'b.md.'],
  ['dot only', '.'],
  ['dot dot', '..'],
  ['forward slash', 'a/b.md'],
  ['leading slash', '/b.md'],
  ['backslash', 'a\\b.md'],
  ['parent traversal', '../b.md'],
  ['NUL', 'b\0.md'],
  ['NUL only', '\0'],
  ['empty', ''],
  ['number', 5],
  ['boolean', true],
  ['null', null],
  ['array', ['b.md']],
  ['object', {}],
  ['String object', new String('b.md')],
  ['explicit undefined', undefined]
]

/** The file-reference rules, tried against one maker so a file-reference operation and rename share them. */
const fileRefKeyVectors = (
  maker: (id: string, input: unknown) => FilesVector,
  decorate: (input: Record<string, unknown>) => Record<string, unknown>
): FilesVector[] => [
  maker('valid sourcePath only', decorate({ sourcePath: 'docs/a.md' })),
  maker('valid externalPath only', decorate({ externalPath: '/tmp/outside/a.md' })),
  maker('neither key', decorate({})),
  maker('neither key beside an unknown key', decorate({ arbitrary: 1 })),
  maker('both keys valid', decorate({ sourcePath: 'a.md', externalPath: '/tmp/a.md' })),
  maker(
    'both keys with an invalid sourcePath',
    decorate({ sourcePath: '../a.md', externalPath: '/tmp/a.md' })
  ),
  maker(
    'both keys with an invalid externalPath',
    decorate({ sourcePath: 'a.md', externalPath: 'a.md' })
  ),
  maker(
    'sourcePath with externalPath undefined',
    decorate({ sourcePath: 'a.md', externalPath: undefined })
  ),
  maker(
    'externalPath with sourcePath undefined',
    decorate({ externalPath: '/tmp/a.md', sourcePath: undefined })
  ),
  maker('both keys undefined', decorate({ sourcePath: undefined, externalPath: undefined })),
  maker(
    'sourcePath null with externalPath undefined',
    decorate({ sourcePath: null, externalPath: undefined })
  ),
  maker(
    'externalPath null with sourcePath undefined',
    decorate({ sourcePath: undefined, externalPath: null })
  ),
  maker('sourcePath with externalPath null', decorate({ sourcePath: 'a.md', externalPath: null })),
  maker('valid sourcePath with an unknown key', decorate({ sourcePath: 'a.md', extra: 1 })),
  maker(
    'valid externalPath with an unknown key',
    decorate({ externalPath: '/tmp/a.md', extra: 1 })
  ),
  maker(
    'inherited sourcePath beside an own unknown key',
    Object.assign(Object.create({ sourcePath: 'a.md' }), decorate({ arbitrary: 1 }))
  ),
  maker(
    'inherited externalPath only',
    Object.assign(Object.create({ externalPath: '/tmp/a.md' }), decorate({}))
  ),
  maker(
    'own sourcePath beside an inherited externalPath',
    Object.assign(Object.create({ externalPath: '/tmp/a.md' }), decorate({ sourcePath: 'a.md' }))
  ),
  maker(
    'own externalPath beside an inherited sourcePath',
    Object.assign(Object.create({ sourcePath: 'a.md' }), decorate({ externalPath: '/tmp/a.md' }))
  ),
  maker(
    'own sourcePath beside an inherited unknown key',
    Object.assign(Object.create({ arbitrary: 1 }), decorate({ sourcePath: 'a.md' }))
  ),
  ...SOURCE_PATH_CASES.map(([name, value]) =>
    maker(`sourcePath ${name}`, decorate(one('sourcePath', value)))
  ),
  ...EXTERNAL_PATH_CASES.map(([name, value]) =>
    maker(`externalPath ${name}`, decorate(one('externalPath', value)))
  )
]

export const filesVectors: FilesVector[] = [
  // ---- copy-content, copy-path, show-in-finder, move-to-trash: a file reference, exactly one of the two paths
  ...shapes(fileRef, 'sourcePath', 'a.md'),
  ...fileRefKeyVectors(fileRef, (input) => input),

  // ---- rename: a file reference plus `name`
  ...shapes(rename, 'name', 'b.md'),
  rename('only a name', one('name', 'b.md')),
  rename('valid sourcePath without a name', { sourcePath: 'docs/a.md' }),
  rename('valid externalPath without a name', { externalPath: '/tmp/a.md' }),
  rename('name explicit undefined beside a valid sourcePath', {
    sourcePath: 'docs/a.md',
    name: undefined
  }),
  rename(
    'inherited name beside an own sourcePath',
    Object.assign(Object.create({ name: 'b.md' }), { sourcePath: 'docs/a.md' })
  ),
  rename(
    'own name beside an inherited sourcePath',
    Object.assign(Object.create({ sourcePath: 'docs/a.md' }), { name: 'b.md' })
  ),
  rename('invalid sourcePath with an invalid name', { sourcePath: '../a.md', name: 'b' }),
  ...fileRefKeyVectors(rename, withName),
  ...NAME_CASES.map(([name, value]) =>
    rename(`name ${name}`, { sourcePath: 'docs/a.md', name: value })
  ),
  ...NAME_CASES.map(([name, value]) =>
    rename(`name ${name} beside an externalPath`, { externalPath: '/tmp/a.md', name: value })
  ),

  // ---- read-source-title: `{ sourcePath }` only
  ...shapes(sourceTitle, 'sourcePath', 'a.md'),
  sourceTitle('missing beside an unknown key', { arbitrary: 1 }),
  sourceTitle('valid sourcePath with an unknown key', { sourcePath: 'a.md', extra: 1 }),
  sourceTitle('externalPath is not a key', { externalPath: '/tmp/a.md' }),
  sourceTitle('valid sourcePath with externalPath', {
    sourcePath: 'a.md',
    externalPath: '/tmp/a.md'
  }),
  sourceTitle('valid sourcePath with externalPath undefined', {
    sourcePath: 'a.md',
    externalPath: undefined
  }),
  sourceTitle(
    'inherited sourcePath beside an own unknown key',
    Object.assign(Object.create({ sourcePath: 'a.md' }), { arbitrary: 1 })
  ),
  sourceTitle(
    'own sourcePath beside an inherited unknown key',
    Object.assign(Object.create({ arbitrary: 1 }), { sourcePath: 'a.md' })
  ),
  ...SOURCE_PATH_CASES.map(([name, value]) =>
    sourceTitle(`sourcePath ${name}`, one('sourcePath', value))
  ),

  // ---- read-workspace-tab: `{ tabId }` only
  ...shapes(tabFile, 'tabId', 'tab-1'),
  tabFile('missing beside an unknown key', { arbitrary: 1 }),
  tabFile('valid tabId with an unknown key', { tabId: 'tab-1', extra: 1 }),
  tabFile('valid tabId with a sourcePath', { tabId: 'tab-1', sourcePath: 'a.md' }),
  tabFile(
    'inherited tabId beside an own unknown key',
    Object.assign(Object.create({ tabId: 'tab-1' }), { arbitrary: 1 })
  ),
  tabFile(
    'own tabId beside an inherited unknown key',
    Object.assign(Object.create({ arbitrary: 1 }), { tabId: 'tab-1' })
  ),
  ...TAB_ID_CASES.map(([name, value]) => tabFile(`tabId ${name}`, one('tabId', value))),
  tabFile('tabId explicit undefined', one('tabId', undefined))
]
