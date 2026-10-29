import { describe, expect, it } from 'vitest'

import {
  getAdjacentWorkspaceTabId,
  getCloseFallbackWorkspaceTabId,
  getNumberedWorkspaceTabId,
  getWorkspaceTabDomId,
  resolveGlobalWorkspaceTabShortcut,
  resolveTablistKeyboardAction
} from './workspace-tab-keyboard'

describe('workspace tab keyboard helpers', () => {
  const tabIds = ['tab-a', 'tab-b', 'tab-c', 'tab-d']

  it('resolves adjacent tabs with wrapping', () => {
    expect(getAdjacentWorkspaceTabId(tabIds, 'tab-a', 'previous')).toBe('tab-d')
    expect(getAdjacentWorkspaceTabId(tabIds, 'tab-d', 'next')).toBe('tab-a')
    expect(getAdjacentWorkspaceTabId(tabIds, null, 'next')).toBe('tab-a')
    expect(getAdjacentWorkspaceTabId(tabIds, null, 'previous')).toBe('tab-d')
    expect(getAdjacentWorkspaceTabId([], null, 'next')).toBeNull()
  })

  it('resolves numbered shortcuts with 9 mapped to the last tab', () => {
    expect(getNumberedWorkspaceTabId(tabIds, '1')).toBe('tab-a')
    expect(getNumberedWorkspaceTabId(tabIds, '3')).toBe('tab-c')
    expect(getNumberedWorkspaceTabId(tabIds, '8')).toBeNull()
    expect(getNumberedWorkspaceTabId(tabIds, '9')).toBe('tab-d')
  })

  it('resolves close fallback to next, previous, then null', () => {
    expect(getCloseFallbackWorkspaceTabId(tabIds, 'tab-b')).toBe('tab-c')
    expect(getCloseFallbackWorkspaceTabId(tabIds, 'tab-d')).toBe('tab-c')
    expect(getCloseFallbackWorkspaceTabId(['tab-a'], 'tab-a')).toBeNull()
    expect(getCloseFallbackWorkspaceTabId(tabIds, 'missing')).toBeNull()
  })

  it('creates stable DOM ids for tab ids', () => {
    expect(getWorkspaceTabDomId('tab-a')).toBe('workspace-tab-tab-a')
    expect(getWorkspaceTabDomId('tab:a/b')).toBe('workspace-tab-tab-3a-a-2f-b')
  })

  it('maps tablist keys to local tab actions', () => {
    expect(resolveTablistKeyboardAction({ key: 'ArrowRight' }, tabIds, 'tab-b')).toEqual({
      type: 'activate',
      tabId: 'tab-c'
    })
    expect(resolveTablistKeyboardAction({ key: 'ArrowLeft' }, tabIds, 'tab-b')).toEqual({
      type: 'activate',
      tabId: 'tab-a'
    })
    expect(resolveTablistKeyboardAction({ key: 'Home' }, tabIds, 'tab-b')).toEqual({
      type: 'activate',
      tabId: 'tab-a'
    })
    expect(resolveTablistKeyboardAction({ key: 'End' }, tabIds, 'tab-b')).toEqual({
      type: 'activate',
      tabId: 'tab-d'
    })
    expect(resolveTablistKeyboardAction({ key: 'Delete' }, tabIds, 'tab-b')).toEqual({
      type: 'close',
      tabId: 'tab-b'
    })
    expect(
      resolveTablistKeyboardAction({ key: 'Delete', repeat: true }, tabIds, 'tab-b')
    ).toBeNull()
    expect(
      resolveTablistKeyboardAction({ key: 'ArrowRight', metaKey: true }, tabIds, 'tab-b')
    ).toBeNull()
  })

  it('maps global application shortcuts to tab actions', () => {
    expect(
      resolveGlobalWorkspaceTabShortcut(
        { key: '}', code: 'BracketRight', metaKey: true, shiftKey: true },
        tabIds,
        'tab-b'
      )
    ).toEqual({ type: 'activate', tabId: 'tab-c' })
    expect(
      resolveGlobalWorkspaceTabShortcut(
        { key: '{', code: 'BracketLeft', metaKey: true, shiftKey: true },
        tabIds,
        'tab-b'
      )
    ).toEqual({ type: 'activate', tabId: 'tab-a' })
    expect(resolveGlobalWorkspaceTabShortcut({ key: '3', metaKey: true }, tabIds, 'tab-b')).toEqual(
      {
        type: 'activate',
        tabId: 'tab-c'
      }
    )
    expect(resolveGlobalWorkspaceTabShortcut({ key: '9', metaKey: true }, tabIds, 'tab-b')).toEqual(
      {
        type: 'activate',
        tabId: 'tab-d'
      }
    )
    expect(resolveGlobalWorkspaceTabShortcut({ key: 'w', metaKey: true }, tabIds, 'tab-b')).toEqual(
      {
        type: 'close-active'
      }
    )
    expect(
      resolveGlobalWorkspaceTabShortcut({ key: 'w', metaKey: true, repeat: true }, tabIds, 'tab-b')
    ).toBeNull()
    expect(
      resolveGlobalWorkspaceTabShortcut(
        { key: 'ArrowRight', metaKey: true, altKey: true },
        tabIds,
        'tab-b'
      )
    ).toBeNull()
  })
})
