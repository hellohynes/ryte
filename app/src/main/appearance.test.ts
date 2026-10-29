import { beforeEach, describe, expect, it, vi } from 'vitest'

const nativeTheme = vi.hoisted(() => ({ themeSource: 'system' as 'system' | 'light' | 'dark' }))

vi.mock('electron', () => ({ nativeTheme }))

import { applyColorMode } from './appearance'

describe('applyColorMode', () => {
  beforeEach(() => {
    nativeTheme.themeSource = 'system'
  })

  it('points the native theme at the chosen mode, so vibrancy and system colors follow it', () => {
    applyColorMode('dark')
    expect(nativeTheme.themeSource).toBe('dark')
    applyColorMode('light')
    expect(nativeTheme.themeSource).toBe('light')
    applyColorMode('system')
    expect(nativeTheme.themeSource).toBe('system')
  })
})
