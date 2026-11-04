import { describe, expect, it, vi } from 'vitest'

import { contract } from '../contract'
import { createEmitter, type WindowLike } from './contract/register'
import { createMenuCommandSender, pickMenuTarget } from './menu-command'

function fakeWindow(): { win: WindowLike; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn()
  return { win: { webContents: { isDestroyed: () => false, send } }, send }
}

describe('pickMenuTarget', () => {
  it('prefers the focused window over the others', () => {
    expect(
      pickMenuTarget(
        () => 'focused',
        () => ['first', 'focused']
      )
    ).toBe('focused')
  })

  it('falls back to the first window when none is focused', () => {
    expect(
      pickMenuTarget(
        () => null,
        () => ['first', 'second']
      )
    ).toBe('first')
  })

  it('returns nothing when there is no window', () => {
    expect(
      pickMenuTarget(
        () => null,
        () => []
      )
    ).toBeNull()
  })
})

describe('createMenuCommandSender', () => {
  it('sends the command to the focused window only, on the contract channel', () => {
    const first = fakeWindow()
    const focused = fakeWindow()
    const third = fakeWindow()
    const windows = [first.win, focused.win, third.win]
    const send = createMenuCommandSender({
      emitTo: createEmitter(() => windows).to,
      getFocused: () => focused.win,
      getAll: () => windows
    })

    send({ type: 'toggle-sidebar' })

    expect(focused.send.mock.calls).toEqual([['app:menu-command', { type: 'toggle-sidebar' }]])
    expect(first.send).not.toHaveBeenCalled()
    expect(third.send).not.toHaveBeenCalled()
  })

  it('uses the first window when none is focused, and still only that one', () => {
    const first = fakeWindow()
    const second = fakeWindow()
    const windows = [first.win, second.win]
    const send = createMenuCommandSender({
      emitTo: createEmitter(() => windows).to,
      getFocused: () => null,
      getAll: () => windows
    })

    send({ type: 'open-recent-file', file: { sourcePath: 'a.md' } })

    expect(first.send.mock.calls).toEqual([
      ['app:menu-command', { type: 'open-recent-file', file: { sourcePath: 'a.md' } }]
    ])
    expect(second.send).not.toHaveBeenCalled()
  })

  it('goes through `to` with the target window and the contract event, never a broadcast', () => {
    const focused = fakeWindow()
    const other = fakeWindow()
    const emitTo = vi.fn()
    const send = createMenuCommandSender({
      emitTo,
      getFocused: () => focused.win,
      getAll: () => [other.win, focused.win]
    })

    send({ type: 'open-settings' })

    expect(emitTo).toHaveBeenCalledTimes(1)
    expect(emitTo).toHaveBeenCalledWith(focused.win.webContents, contract.app.events.menuCommand, {
      type: 'open-settings'
    })
  })

  it('sends nothing when there is no window', () => {
    const emitTo = vi.fn()
    const send = createMenuCommandSender({ emitTo, getFocused: () => null, getAll: () => [] })

    expect(() => send({ type: 'open-settings' })).not.toThrow()
    expect(emitTo).not.toHaveBeenCalled()
  })
})
