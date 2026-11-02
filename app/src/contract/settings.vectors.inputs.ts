// Golden-vector inputs for the `settings` operations, authored as real TypeScript values so that NaN, Infinity,
// undefined-valued keys, own `__proto__` keys, inherited keys and non-plain objects survive. The expected
// results live in `settings.vectors.expected.json` and were recorded once from the pre-change validators
// (`assertValidSettingsPatch` for `save`, `assertValidProviderId` for the provider of `validate-key` and
// `list-models`). Do not derive expectations from new code.
//
// Vector ids are written `save: ...` and `provider: ...` (a colon and a space) so that none is shaped like an
// `area:name` channel, which `check:contract` would report. Every key and secret here is synthetic.

import { MAX_PATH_LENGTH } from '../shared/source-path'

export interface SettingsVector {
  id: string
  op: 'save' | 'provider'
  input: unknown
}

// Every key the old validator allows, with one valid value each.
const validAck = {
  acknowledgedAt: '2026-01-01T00:00:00.000Z',
  provider: 'openai',
  model: 'gpt-5.2'
}

export const ALL_SETTINGS_KEYS = [
  'notesRoot',
  'model',
  'cloudAnswersEnabled',
  'semanticIndexEnabled',
  'firstCloudUseAcknowledgedAt',
  'cloudAnswersAcknowledgement',
  'semanticIndexAcknowledgement',
  'answerProvider',
  'answerModel',
  'embeddingProvider',
  'embeddingModel',
  'searchHistoryRetention',
  'searchHistoryIncludesAnswers',
  'scrollbarVisibility',
  'fontFamily',
  'colorMode',
  'ticketLinkBase',
  'pullRequestLinkBase',
  'anthropicKey',
  'openaiKey',
  'geminiKey',
  'deleteProviderKeys'
] as const

const validPatch: Record<string, unknown> = {
  notesRoot: '/Users/synthetic/Notes',
  model: 'gpt-5.2',
  cloudAnswersEnabled: true,
  semanticIndexEnabled: false,
  firstCloudUseAcknowledgedAt: '2026-01-01T00:00:00.000Z',
  cloudAnswersAcknowledgement: validAck,
  semanticIndexAcknowledgement: null,
  answerProvider: 'anthropic',
  answerModel: 'claude-synthetic',
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  searchHistoryRetention: '30-days',
  searchHistoryIncludesAnswers: false,
  scrollbarVisibility: 'always',
  fontFamily: 'ibm-plex',
  colorMode: 'dark',
  ticketLinkBase: 'https://example.atlassian.net/browse/',
  pullRequestLinkBase: 'https://github.com/example/repo/pull/',
  anthropicKey: 'synthetic-anthropic-value',
  openaiKey: 'synthetic-openai-value',
  geminiKey: 'synthetic-gemini-value',
  deleteProviderKeys: ['gemini']
}

const save = (id: string, input: unknown): SettingsVector => ({
  id: `save: ${id}`,
  op: 'save',
  input
})

/** A patch with one key. */
const one = (id: string, key: string, value: unknown): SettingsVector => save(id, { [key]: value })

const provider = (id: string, input: unknown): SettingsVector => ({
  id: `provider: ${id}`,
  op: 'provider',
  input
})

const jsonObject = (text: string): unknown => JSON.parse(text)

class PatchLike {
  colorMode = 'dark'
}

const sparse = (): unknown[] => {
  const array: unknown[] = []
  array[1] = 'openai'
  return array
}

const longPath = (length: number): string => `/${'a'.repeat(length - 1)}`

export const settingsVectors: SettingsVector[] = [
  // patch shapes
  save('empty object', {}),
  save('undefined', undefined),
  save('null', null),
  save('string', 'colorMode'),
  save('number', 5),
  save('boolean', true),
  save('empty array', []),
  save('array holding a patch', [{ colorMode: 'dark' }]),
  save('Date instance', new Date(0)),
  save('Map instance', new Map()),
  save('class instance with a valid own field', new PatchLike()),
  save(
    'null-prototype object with a valid key',
    Object.assign(Object.create(null), { colorMode: 'dark' })
  ),
  save('symbol key is ignored', { [Symbol('s')]: 1, colorMode: 'dark' }),
  save('every key valid at once', validPatch),
  save('two valid keys', { colorMode: 'light', fontFamily: 'geist' }),
  save('valid key with an invalid key', { colorMode: 'dark', fontFamily: 'papyrus' }),
  save('valid key with an unknown key', { colorMode: 'dark', arbitrary: true }),
  save('only an unknown key', { arbitrary: true }),
  save('constructor as a key', { constructor: 1 }),
  save('toString as a key', { toString: 'x' }),
  save('own __proto__ key', jsonObject('{"__proto__":{"x":1}}')),
  save(
    'own __proto__ key with a valid key',
    jsonObject('{"__proto__":{"x":1},"colorMode":"dark"}')
  ),
  // inherited keys: the old validator checked own keys, then read each field with `in`
  save('inherited valid key only', Object.create({ colorMode: 'dark' })),
  save(
    'inherited valid key beside an own key',
    Object.assign(Object.create({ fontFamily: 'geist' }), { colorMode: 'dark' })
  ),
  save('inherited invalid key only', Object.create({ colorMode: 'sepia' })),
  save('inherited unknown key only', Object.create({ arbitrary: true })),

  // explicit undefined, for every key
  ...ALL_SETTINGS_KEYS.map((key) => one(`${key} explicit undefined`, key, undefined)),

  // notesRoot
  one('notesRoot absolute', 'notesRoot', '/Users/synthetic/Notes'),
  one('notesRoot root only', 'notesRoot', '/'),
  one('notesRoot with parent segments', 'notesRoot', '/Users/synthetic/../Notes'),
  one('notesRoot with a trailing space', 'notesRoot', '/Users/synthetic/Notes '),
  one('notesRoot with unicode', 'notesRoot', '/Users/synthetic/Notizen/日本語'),
  one(`notesRoot at ${MAX_PATH_LENGTH} characters`, 'notesRoot', longPath(MAX_PATH_LENGTH)),
  one(`notesRoot at ${MAX_PATH_LENGTH + 1} characters`, 'notesRoot', longPath(MAX_PATH_LENGTH + 1)),
  one('notesRoot with a NUL', 'notesRoot', '/Users/synthetic/a\0b'),
  one('notesRoot relative', 'notesRoot', 'Notes'),
  one('notesRoot dot relative', 'notesRoot', './Notes'),
  one('notesRoot tilde', 'notesRoot', '~/Notes'),
  one('notesRoot windows drive path', 'notesRoot', 'C:\\Notes'),
  one('notesRoot empty', 'notesRoot', ''),
  one('notesRoot number', 'notesRoot', 5),
  one('notesRoot NaN', 'notesRoot', Number.NaN),
  one('notesRoot null', 'notesRoot', null),
  one('notesRoot array', 'notesRoot', ['/Users/synthetic/Notes']),
  one('notesRoot object', 'notesRoot', {}),

  // model and answerModel: trimmed length 1 to 200, the original string kept
  ...(['model', 'answerModel'] as const).flatMap((key) => [
    one(`${key} typical`, key, 'gpt-5.2'),
    one(`${key} one character`, key, 'm'),
    one(`${key} 200 characters`, key, 'x'.repeat(200)),
    one(`${key} 201 characters`, key, 'x'.repeat(201)),
    one(`${key} padded is kept untrimmed`, key, '  gpt-5.2  '),
    one(
      `${key} trimmed length 1 with a long raw length`,
      key,
      `${' '.repeat(5)}m${' '.repeat(300)}`
    ),
    one(`${key} 200 characters plus padding`, key, `${'x'.repeat(200)}   `),
    one(`${key} empty`, key, ''),
    one(`${key} whitespace only`, key, '     '),
    one(`${key} number`, key, 5),
    one(`${key} null`, key, null),
    one(`${key} array`, key, ['gpt-5.2'])
  ]),

  // booleans
  ...(
    ['cloudAnswersEnabled', 'semanticIndexEnabled', 'searchHistoryIncludesAnswers'] as const
  ).flatMap((key) => [
    one(`${key} true`, key, true),
    one(`${key} false`, key, false),
    one(`${key} string true`, key, 'true'),
    one(`${key} number 1`, key, 1),
    one(`${key} number 0`, key, 0),
    one(`${key} NaN`, key, Number.NaN),
    one(`${key} null`, key, null)
  ]),

  // firstCloudUseAcknowledgedAt
  one('firstCloudUseAcknowledgedAt null', 'firstCloudUseAcknowledgedAt', null),
  one('firstCloudUseAcknowledgedAt a string', 'firstCloudUseAcknowledgedAt', '2026-01-01'),
  one('firstCloudUseAcknowledgedAt empty string', 'firstCloudUseAcknowledgedAt', ''),
  one('firstCloudUseAcknowledgedAt number', 'firstCloudUseAcknowledgedAt', 5),
  one('firstCloudUseAcknowledgedAt boolean', 'firstCloudUseAcknowledgedAt', true),
  one('firstCloudUseAcknowledgedAt object', 'firstCloudUseAcknowledgedAt', {}),

  // acknowledgements
  ...(['cloudAnswersAcknowledgement', 'semanticIndexAcknowledgement'] as const).flatMap((key) => [
    one(`${key} null`, key, null),
    one(`${key} complete`, key, validAck),
    one(`${key} complete with another provider`, key, { ...validAck, provider: 'gemini' }),
    one(`${key} with an extra key`, key, { ...validAck, extra: 'x' }),
    one(
      `${key} with an own __proto__ key`,
      key,
      jsonObject(
        '{"acknowledgedAt":"2026-01-01T00:00:00.000Z","provider":"openai","model":"m","__proto__":{"x":1}}'
      )
    ),
    one(`${key} null-prototype complete`, key, Object.assign(Object.create(null), validAck)),
    one(`${key} missing acknowledgedAt`, key, { provider: 'openai', model: 'm' }),
    one(`${key} missing provider`, key, { acknowledgedAt: 'x', model: 'm' }),
    one(`${key} missing model`, key, { acknowledgedAt: 'x', provider: 'openai' }),
    one(`${key} empty model`, key, { ...validAck, model: '' }),
    one(`${key} whitespace model`, key, { ...validAck, model: '   ' }),
    one(`${key} model number`, key, { ...validAck, model: 5 }),
    one(`${key} unknown provider`, key, { ...validAck, provider: 'bogus' }),
    one(`${key} acknowledgedAt number`, key, { ...validAck, acknowledgedAt: 5 }),
    one(`${key} empty object`, key, {}),
    one(`${key} array`, key, []),
    one(`${key} string`, key, 'yes'),
    one(`${key} number`, key, 1),
    one(`${key} Date instance`, key, new Date(0))
  ]),

  // enums
  ...['anthropic', 'openai', 'gemini', '', 'OpenAI', ' openai', 5, null].map((value) =>
    one(`answerProvider ${JSON.stringify(value)}`, 'answerProvider', value)
  ),
  ...['openai', 'anthropic', '', 5].map((value) =>
    one(`embeddingProvider ${JSON.stringify(value)}`, 'embeddingProvider', value)
  ),
  ...['text-embedding-3-small', 'text-embedding-3-large', '', 5].map((value) =>
    one(`embeddingModel ${JSON.stringify(value)}`, 'embeddingModel', value)
  ),
  ...['off', 'session', '7-days', '30-days', 'forever', 'forever ', '30 days', '', 30, null].map(
    (value) =>
      one(`searchHistoryRetention ${JSON.stringify(value)}`, 'searchHistoryRetention', value)
  ),
  ...['auto', 'always', 'visible', 'Auto', '', true].map((value) =>
    one(`scrollbarVisibility ${JSON.stringify(value)}`, 'scrollbarVisibility', value)
  ),
  ...['geist', 'system', 'ibm-plex', 'papyrus', '', 'Geist', 5].map((value) =>
    one(`fontFamily ${JSON.stringify(value)}`, 'fontFamily', value)
  ),
  ...['system', 'light', 'dark', 'sepia', 'Dark', '', 5, null].map((value) =>
    one(`colorMode ${JSON.stringify(value)}`, 'colorMode', value)
  ),

  // link bases
  ...(['ticketLinkBase', 'pullRequestLinkBase'] as const).flatMap((key) => [
    one(`${key} empty switches linking off`, key, ''),
    one(`${key} https host`, key, 'https://example.atlassian.net'),
    one(`${key} https path`, key, 'https://github.com/example/repo/pull/'),
    one(`${key} https 300 characters`, key, `https://example.com/${'a'.repeat(280)}`),
    one(`${key} https 301 characters`, key, `https://example.com/${'a'.repeat(281)}`),
    one(`${key} http`, key, 'http://example.com/'),
    one(`${key} javascript scheme`, key, 'javascript:alert(1)'),
    one(`${key} ftp`, key, 'ftp://example.com/'),
    one(`${key} credentials`, key, 'https://user:synthetic@example.com/'),
    one(`${key} user only`, key, 'https://user@example.com/'),
    one(`${key} whitespace inside`, key, 'https://exa mple.com/'),
    one(`${key} leading space`, key, ' https://example.com/'),
    one(`${key} not a url`, key, 'not a url'),
    one(`${key} number`, key, 5),
    one(`${key} null`, key, null)
  ]),

  // provider keys: trimmed, stored trimmed, blank rejected, no length bound
  ...(['anthropicKey', 'openaiKey', 'geminiKey'] as const).flatMap((key) => [
    one(`${key} typical`, key, 'synthetic-key-value'),
    one(`${key} padded is trimmed`, key, '   synthetic-key-value   '),
    one(`${key} inner whitespace kept`, key, 'synthetic key value'),
    one(`${key} 10000 characters`, key, 'k'.repeat(10000)),
    one(`${key} empty`, key, ''),
    one(`${key} whitespace only`, key, '    '),
    one(`${key} tab and newline only`, key, '\t\n'),
    one(`${key} number`, key, 5),
    one(`${key} null`, key, null),
    one(`${key} array`, key, ['synthetic-key-value'])
  ]),
  save('all three keys at once', {
    anthropicKey: ' a ',
    openaiKey: ' b ',
    geminiKey: ' c '
  }),
  save('a key and its deletion together', {
    openaiKey: 'synthetic-key-value',
    deleteProviderKeys: ['openai']
  }),

  // deleteProviderKeys
  one('deleteProviderKeys empty', 'deleteProviderKeys', []),
  one('deleteProviderKeys one', 'deleteProviderKeys', ['openai']),
  one('deleteProviderKeys all three', 'deleteProviderKeys', ['anthropic', 'openai', 'gemini']),
  one('deleteProviderKeys repeated', 'deleteProviderKeys', ['openai', 'openai']),
  one(
    'deleteProviderKeys 100 long',
    'deleteProviderKeys',
    Array.from({ length: 100 }, () => 'openai')
  ),
  one('deleteProviderKeys sparse', 'deleteProviderKeys', sparse()),
  one('deleteProviderKeys unknown provider', 'deleteProviderKeys', ['bogus']),
  one('deleteProviderKeys valid then invalid', 'deleteProviderKeys', ['openai', 'bogus']),
  one('deleteProviderKeys null element', 'deleteProviderKeys', [null]),
  one('deleteProviderKeys number element', 'deleteProviderKeys', ['openai', 5]),
  one('deleteProviderKeys a string', 'deleteProviderKeys', 'openai'),
  one('deleteProviderKeys an object', 'deleteProviderKeys', {}),
  one('deleteProviderKeys null', 'deleteProviderKeys', null),

  // the provider of validate-key and list-models
  provider('anthropic', 'anthropic'),
  provider('openai', 'openai'),
  provider('gemini', 'gemini'),
  provider('unknown', 'bogus'),
  provider('empty string', ''),
  provider('capitalised', 'OpenAI'),
  provider('leading space', ' openai'),
  provider('trailing NUL', 'openai\0'),
  provider('undefined', undefined),
  provider('null', null),
  provider('number', 5),
  provider('NaN', Number.NaN),
  provider('boolean', true),
  provider('empty object', {}),
  provider('object with a provider field', { provider: 'openai' }),
  provider('array holding a provider', ['openai']),
  provider('Date instance', new Date(0))
]
