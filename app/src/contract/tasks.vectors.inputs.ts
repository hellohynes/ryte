// Golden-vector inputs for the `tasks` operations, authored as real TypeScript values so that NaN,
// Infinity, -0, undefined-valued keys, own `__proto__` keys and non-plain objects survive. The expected
// results live in `tasks.vectors.expected.json` and were recorded once from the pre-change validators
// (`assertValidTaskListInput`, `assertValidTaskToggleInput`). Do not derive expectations from new code.

export interface TaskVector {
  id: string
  op: 'list' | 'toggle'
  input: unknown
}

const validToggle = {
  sourcePath: 'folder/tasks.md',
  line: 3,
  checkboxColumn: 2,
  checked: true,
  expectedLine: '- [ ] Follow up'
}

function toggle(id: string, overrides: Record<string, unknown>): TaskVector {
  return { id: `toggle: ${id}`, op: 'toggle', input: { ...validToggle, ...overrides } }
}

function toggleWithout(key: string): TaskVector {
  const input: Record<string, unknown> = { ...validToggle }
  delete input[key]
  return { id: `toggle: missing ${key}`, op: 'toggle', input }
}

function list(id: string, input: unknown): TaskVector {
  return { id: `list: ${id}`, op: 'list', input }
}

function raw(id: string, input: unknown): TaskVector {
  return { id: `toggle: ${id}`, op: 'toggle', input }
}

const protoKeyJson = (extra: string): unknown => JSON.parse(`{"__proto__":{"x":1}${extra}}`)

export const taskVectors: TaskVector[] = [
  // list: shapes the old validator accepts
  list('undefined', undefined),
  list('null', null),
  list('empty object', {}),
  list('checked true', { checked: true }),
  list('checked false', { checked: false }),
  list('limit 0', { limit: 0 }),
  list('limit 25', { limit: 25 }),
  list('limit 25.7 is floored', { limit: 25.7 }),
  list('limit 200', { limit: 200 }),
  list('limit 0.9 is floored', { limit: 0.9 }),
  list('limit negative zero', { limit: -0 }),
  list('checked and limit', { checked: false, limit: 25 }),
  list('null-prototype object', Object.assign(Object.create(null), { limit: 3 })),
  list('inherited key is ignored', Object.assign(Object.create({ inherited: true }), { limit: 4 })),
  list('symbol key is ignored', { [Symbol('s')]: 1, limit: 5 }),
  list('Date instance', new Date(0)),
  list('Map instance', new Map()),
  // list: rejected
  list('limit 201', { limit: 201 }),
  list('limit 200.5', { limit: 200.5 }),
  list('limit -1', { limit: -1 }),
  list('limit -0.5', { limit: -0.5 }),
  list('limit NaN', { limit: Number.NaN }),
  list('limit Infinity', { limit: Number.POSITIVE_INFINITY }),
  list('limit string', { limit: '5' }),
  list('limit null', { limit: null }),
  list('limit explicit undefined', { limit: undefined }),
  list('checked string', { checked: 'false' }),
  list('checked null', { checked: null }),
  list('checked explicit undefined', { checked: undefined }),
  list('unknown key', { arbitrary: true }),
  list('known key plus unknown key', { checked: true, extra: 1 }),
  list('own __proto__ key', protoKeyJson('')),
  list('string', 'tasks'),
  list('number', 5),
  list('boolean', true),
  list('empty array', []),
  list('array with element', [1]),

  // toggle: accepted
  { id: 'toggle: valid', op: 'toggle', input: { ...validToggle } },
  toggle('checked false', { checked: false }),
  toggle('empty expectedLine', { expectedLine: '' }),
  toggle('expectedLine at 20000 characters', { expectedLine: 'x'.repeat(20000) }),
  toggle('line 1', { line: 1 }),
  toggle('checkboxColumn 0', { checkboxColumn: 0 }),
  toggle('line 2^53 is an integer', { line: 2 ** 53 }),
  toggle('line 1e21 is an integer', { line: 1e21 }),
  toggle('current-directory prefix is normalized', { sourcePath: './folder/tasks.md' }),
  toggle('double slash is normalized', { sourcePath: 'a//b.md' }),
  toggle('dot segment is normalized', { sourcePath: 'a/./b.md' }),
  toggle('trailing slash is normalized', { sourcePath: 'a/b/' }),
  toggle('backslash stays on posix', { sourcePath: 'a\\b.md' }),
  toggle('dotdot-prefixed name is allowed', { sourcePath: '..a/b.md' }),
  toggle('dotdot-suffixed name is allowed', { sourcePath: 'a/b..md' }),
  toggle('drive-relative name is allowed', { sourcePath: 'C:x.md' }),
  toggle('unicode path', { sourcePath: 'notes/日本語.md' }),
  toggle('space-only path', { sourcePath: ' ' }),
  toggle('path at 4096 characters', { sourcePath: 'a'.repeat(4096) }),
  raw('null-prototype object', Object.assign(Object.create(null), validToggle)),
  raw('inherited key is ignored', Object.assign(Object.create({ inherited: true }), validToggle)),
  raw('symbol key is ignored', { ...validToggle, [Symbol('s')]: 1 }),

  // toggle: rejected
  toggleWithout('sourcePath'),
  toggleWithout('line'),
  toggleWithout('checkboxColumn'),
  toggleWithout('checked'),
  toggleWithout('expectedLine'),
  toggle('line 0', { line: 0 }),
  toggle('line -1', { line: -1 }),
  toggle('line 1.5', { line: 1.5 }),
  toggle('line NaN', { line: Number.NaN }),
  toggle('line Infinity', { line: Number.POSITIVE_INFINITY }),
  toggle('line string', { line: '3' }),
  toggle('line null', { line: null }),
  toggle('checkboxColumn -1', { checkboxColumn: -1 }),
  toggle('checkboxColumn 1.5', { checkboxColumn: 1.5 }),
  toggle('checkboxColumn NaN', { checkboxColumn: Number.NaN }),
  toggle('checkboxColumn string', { checkboxColumn: '2' }),
  toggle('checked string', { checked: 'true' }),
  toggle('checked number', { checked: 1 }),
  toggle('checked explicit undefined', { checked: undefined }),
  toggle('expectedLine number', { expectedLine: 5 }),
  toggle('expectedLine null', { expectedLine: null }),
  toggle('expectedLine explicit undefined', { expectedLine: undefined }),
  toggle('expectedLine at 20001 characters', { expectedLine: 'x'.repeat(20001) }),
  toggle('parent traversal', { sourcePath: '../tasks.md' }),
  toggle('embedded parent traversal', { sourcePath: 'a/../b.md' }),
  toggle('traversal with backslash', { sourcePath: 'a\\..\\b.md' }),
  toggle('bare parent', { sourcePath: '..' }),
  toggle('bare current directory', { sourcePath: '.' }),
  toggle('absolute posix path', { sourcePath: '/etc/tasks.md' }),
  toggle('root only', { sourcePath: '/' }),
  toggle('windows drive path', { sourcePath: 'C:\\tasks.md' }),
  toggle('windows drive path with slash', { sourcePath: 'C:/tasks.md' }),
  toggle('windows UNC path', { sourcePath: '\\\\server\\share\\tasks.md' }),
  toggle('windows extended path', { sourcePath: '\\\\?\\C:\\tasks.md' }),
  toggle('empty path', { sourcePath: '' }),
  toggle('NUL in path', { sourcePath: 'a\0b.md' }),
  toggle('path at 4097 characters', { sourcePath: 'a'.repeat(4097) }),
  toggle('path number', { sourcePath: 123 }),
  toggle('path null', { sourcePath: null }),
  toggle('path explicit undefined', { sourcePath: undefined }),
  toggle('path object', { sourcePath: {} }),
  toggle('unknown key', { arbitrary: true }),
  raw('only unknown key', { arbitrary: true }),
  raw(
    'own __proto__ key',
    protoKeyJson(
      ',"sourcePath":"a.md","line":1,"checkboxColumn":0,"checked":true,"expectedLine":""'
    )
  ),
  raw('empty object', {}),
  raw('undefined', undefined),
  raw('null', null),
  raw('string', 'tasks'),
  raw('number', 5),
  raw('array', []),
  raw('Date instance', new Date(0)),
  raw('Map instance', new Map())
]
