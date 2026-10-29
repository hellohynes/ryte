import { describe, expect, it } from 'vitest'

import { resolveAppShortcutAction, shouldScheduleControlShortcutBadges } from './app-shortcuts'

describe('resolveAppShortcutAction', () => {
  it('resolves primary macOS app commands', () => {
    expect(resolveAppShortcutAction({ key: '1', metaKey: true })).toBeNull()
    expect(resolveAppShortcutAction({ key: '2', metaKey: true })).toBeNull()
    expect(resolveAppShortcutAction({ key: 'b', metaKey: true })).toEqual({
      type: 'toggle-sidebar'
    })
    expect(resolveAppShortcutAction({ key: 'k', metaKey: true })).toEqual({
      type: 'open-search'
    })
    expect(resolveAppShortcutAction({ key: 'p', metaKey: true })).toEqual({
      type: 'open-file'
    })
    expect(resolveAppShortcutAction({ key: 'o', metaKey: true })).toEqual({
      type: 'open-native-file'
    })
    expect(resolveAppShortcutAction({ key: ',', metaKey: true })).toEqual({
      type: 'open-settings'
    })
    expect(resolveAppShortcutAction({ key: '}', metaKey: true, shiftKey: true })).toEqual({
      type: 'focus-next-tab'
    })
    expect(resolveAppShortcutAction({ key: '{', metaKey: true, shiftKey: true })).toEqual({
      type: 'focus-previous-tab'
    })
  })

  it('resolves control rail commands', () => {
    expect(resolveAppShortcutAction({ key: '1', ctrlKey: true })).toBeNull()
    expect(resolveAppShortcutAction({ key: '2', ctrlKey: true })).toBeNull()
    expect(resolveAppShortcutAction({ key: '0', ctrlKey: true })).toEqual({
      type: 'open-settings'
    })
    expect(resolveAppShortcutAction({ key: '/', ctrlKey: true })).toEqual({
      type: 'open-search'
    })
    expect(resolveAppShortcutAction({ key: 't', ctrlKey: true })).toEqual({
      type: 'toggle-sidebar'
    })
    expect(resolveAppShortcutAction({ key: 'o', ctrlKey: true })).toEqual({
      type: 'open-native-file'
    })
  })

  it('does not resolve shortcuts while a modal is open', () => {
    expect(resolveAppShortcutAction({ key: 'k', metaKey: true, modalOpen: true })).toBeNull()
    expect(resolveAppShortcutAction({ key: '1', ctrlKey: true, modalOpen: true })).toBeNull()
  })

  it('ignores prevented, unsupported, and extra-modifier shortcuts', () => {
    expect(resolveAppShortcutAction({ key: 'k', metaKey: true, defaultPrevented: true })).toBeNull()
    expect(resolveAppShortcutAction({ key: '3', ctrlKey: true })).toBeNull()
    expect(resolveAppShortcutAction({ key: 'k', metaKey: true, shiftKey: true })).toBeNull()
    expect(resolveAppShortcutAction({ key: 'p', ctrlKey: true })).toBeNull()
    expect(resolveAppShortcutAction({ key: '0', metaKey: true })).toBeNull()
  })
})

describe('shouldScheduleControlShortcutBadges', () => {
  it('schedules badges only for an unhandled bare Control press outside modals', () => {
    expect(shouldScheduleControlShortcutBadges({ key: 'Control' })).toBe(true)
    expect(shouldScheduleControlShortcutBadges({ key: 'Control', modalOpen: true })).toBe(false)
    expect(shouldScheduleControlShortcutBadges({ key: 'Control', defaultPrevented: true })).toBe(
      false
    )
    expect(shouldScheduleControlShortcutBadges({ key: 'Control', shiftKey: true })).toBe(false)
    expect(shouldScheduleControlShortcutBadges({ key: '1', ctrlKey: true })).toBe(false)
  })
})
