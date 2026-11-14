import { describe, expect, it } from 'vitest'

import { app, appMenuCommand, getVersion, menuCommand } from './app'
import { parseOperationInput } from './define'
import { createContractApi } from '../preload/contract-api'
import { manifest } from './manifest.generated'

describe('app contract', () => {
  it('keeps the wire channel name and the renderer-facing operation name', () => {
    expect(getVersion.channel).toBe('app:get-version')
    expect(Object.keys(app.operations)).toEqual(['getVersion'])
  })

  it('validates the example against its own schemas', () => {
    expect(getVersion.input.safeParse(getVersion.example.input).success).toBe(true)
    expect(getVersion.output.safeParse(getVersion.example.output).success).toBe(true)
  })

  it('accepts no input', () => {
    expect(getVersion.input.safeParse(undefined).success).toBe(true)
  })

  // Accepted deviation: the legacy handler ignored any argument; the contract rejects one.
  it('rejects a stray argument', () => {
    for (const stray of [{}, null, 'x', 0, false]) {
      expect(() => parseOperationInput('app.getVersion', getVersion.input, stray)).toThrow(
        'Invalid app.getVersion input'
      )
    }
  })

  it('returns a string', () => {
    expect(getVersion.output.safeParse('1.2.3').success).toBe(true)
    expect(getVersion.output.safeParse(1).success).toBe(false)
  })
})

// A pure event has no input to feed recorded vectors, so the payload is checked with authored cases. The
// `open-recent-file` expectations were recorded once from the legacy `assertValidWorkspaceOpenRecentFileInput`
// (every case agreed with it, accepted value included) before it was retired from this path.
describe('app.menuCommand event', () => {
  const accepts = (value: unknown): boolean => appMenuCommand.safeParse(value).success

  it('keeps the channel and the renderer-facing subscriber name', () => {
    expect(menuCommand.channel).toBe('app:menu-command')
    expect(Object.keys(app.events)).toEqual(['menuCommand'])
    expect(manifest.app.events).toEqual({ menuCommand: 'app:menu-command' })

    const subscribed: string[] = []
    const api = createContractApi<Record<string, Record<string, unknown>>>(
      {
        invoke: async () => undefined,
        on: (channel) => void subscribed.push(channel),
        removeListener: () => undefined
      },
      manifest
    )
    expect(Object.keys(api.app).sort()).toEqual(['getVersion', 'onMenuCommand'])
    ;(api.app.onMenuCommand as (cb: () => void) => void)(() => undefined)
    expect(subscribed).toEqual(['app:menu-command'])
  })

  it.each([
    { type: 'open-native-file' },
    { type: 'open-source-path', sourcePath: 'notes/a.md' },
    { type: 'open-recent-file', file: { sourcePath: 'notes/a.md' } },
    { type: 'open-recent-file', file: { externalPath: '/tmp/a.md' } },
    { type: 'close-active-tab' },
    { type: 'close-all-tabs' },
    { type: 'focus-next-tab' },
    { type: 'focus-previous-tab' },
    { type: 'toggle-sidebar' },
    { type: 'toggle-source-mode' },
    { type: 'open-settings' },
    { type: 'open-in-browser' }
  ])('accepts %j', (command) => {
    expect(accepts(command)).toBe(true)
  })

  it('covers exactly the eleven command types', () => {
    expect(appMenuCommand.options.map((option) => option.shape.type.value).sort()).toEqual(
      [
        'close-active-tab',
        'close-all-tabs',
        'focus-next-tab',
        'focus-previous-tab',
        'open-in-browser',
        'open-native-file',
        'open-recent-file',
        'open-settings',
        'open-source-path',
        'toggle-sidebar',
        'toggle-source-mode'
      ].sort()
    )
  })

  it.each([
    ['an unknown type', { type: 'quit' }],
    ['no type', {}],
    ['a non-object', 'open-settings'],
    ['null', null],
    ['an extra key on a bare command', { type: 'open-settings', extra: 1 }],
    [
      'an extra key on open-source-path',
      { type: 'open-source-path', sourcePath: 'a.md', extra: 1 }
    ],
    ['open-source-path without its field', { type: 'open-source-path' }],
    [
      'open-source-path with a traversing path',
      { type: 'open-source-path', sourcePath: '../a.md' }
    ],
    ['open-source-path with an absolute path', { type: 'open-source-path', sourcePath: '/a.md' }],
    ['open-recent-file without its field', { type: 'open-recent-file' }],
    ['open-recent-file with an empty file', { type: 'open-recent-file', file: {} }],
    [
      'open-recent-file with both paths',
      { type: 'open-recent-file', file: { sourcePath: 'a.md', externalPath: '/tmp/a.md' } }
    ],
    [
      'open-recent-file with an external path that is not Markdown',
      { type: 'open-recent-file', file: { externalPath: '/tmp/a.txt' } }
    ],
    [
      'open-recent-file with a relative external path',
      { type: 'open-recent-file', file: { externalPath: 'a.md' } }
    ],
    [
      'open-recent-file with an extra key inside the file',
      { type: 'open-recent-file', file: { sourcePath: 'a.md', extra: 1 } }
    ],
    [
      'open-recent-file with an extra key beside the file',
      { type: 'open-recent-file', file: { sourcePath: 'a.md' }, extra: 1 }
    ]
  ])('rejects %s', (_label, value) => {
    expect(accepts(value)).toBe(false)
  })

  it('treats an undefined other path as absent, as the legacy validator did', () => {
    expect(
      accepts({ type: 'open-recent-file', file: { sourcePath: 'a.md', externalPath: undefined } })
    ).toBe(true)
    expect(
      accepts({
        type: 'open-recent-file',
        file: { sourcePath: undefined, externalPath: undefined }
      })
    ).toBe(false)
  })

  it('normalizes paths the way the legacy validator did', () => {
    expect(
      appMenuCommand.parse({ type: 'open-recent-file', file: { externalPath: '/tmp/../x.md' } })
    ).toEqual({ type: 'open-recent-file', file: { externalPath: '/x.md' } })
    expect(appMenuCommand.parse({ type: 'open-source-path', sourcePath: 'a/./b.md' })).toEqual({
      type: 'open-source-path',
      sourcePath: 'a/b.md'
    })
  })
})
