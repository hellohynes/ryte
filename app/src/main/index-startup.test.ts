import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const order: string[] = []
  const appHandlers = new Map<string, () => void>()
  const windowOptions: Array<{ title?: string }> = []

  class BrowserWindowMock {
    static getAllWindows = vi.fn(() => [])

    constructor(options: { title?: string }) {
      order.push('window:create')
      windowOptions.push(options)
    }

    on = vi.fn()
    once = vi.fn((event: string, listener: () => void) => {
      if (event === 'ready-to-show') setImmediate(listener)
      return this
    })
    loadFile = vi.fn()
    loadURL = vi.fn()
    getNormalBounds = vi.fn(() => ({ x: 0, y: 0, width: 800, height: 600 }))
    isMaximized = vi.fn(() => false)
    isFullScreen = vi.fn(() => false)
  }

  return {
    order,
    appHandlers,
    windowOptions,
    app: {
      setName: vi.fn(),
      whenReady: vi.fn(() => Promise.resolve()),
      on: vi.fn((event: string, listener: () => void) => {
        appHandlers.set(event, listener)
      }),
      quit: vi.fn(),
      exit: vi.fn()
    },
    BrowserWindowMock,
    indexerInit: vi.fn(() => {
      order.push('indexer:init')
      return true
    }),
    applyColorMode: vi.fn((mode: string) => {
      order.push(`theme:${mode}`)
    })
  }
})

vi.mock('electron', () => ({
  app: mocks.app,
  BrowserWindow: mocks.BrowserWindowMock,
  Notification: { isSupported: vi.fn(() => false) },
  screen: { getAllDisplays: vi.fn(() => []) }
}))

vi.mock('@electron-toolkit/utils', () => ({
  electronApp: { setAppUserModelId: vi.fn() },
  optimizer: { watchWindowShortcuts: vi.fn() },
  is: { dev: false }
}))

vi.mock('../../resources/icon.png?asset', () => ({ default: 'icon.png' }))

vi.mock('./app-menu', () => ({ installAppMenu: vi.fn() }))
vi.mock('./appearance', () => ({ applyColorMode: mocks.applyColorMode }))
vi.mock('./ipc', () => ({ registerIpc: vi.fn() }))
vi.mock('./indexing/indexer-service', () => ({
  indexerService: {
    init: mocks.indexerInit,
    subscribe: vi.fn(),
    triggerReindex: vi.fn()
  }
}))
vi.mock('./indexing/watcher', () => ({ watcher: { start: vi.fn() } }))
vi.mock('./navigation', () => ({
  installNavigationGuards: vi.fn(),
  originForUrl: vi.fn(() => null)
}))
vi.mock('./settings/settings-store', () => ({
  settingsStore: { load: vi.fn(() => ({ notesRoot: '/notes', colorMode: 'dark' })) }
}))
vi.mock('./workspace/workspace-store', () => ({
  workspaceStore: {
    publicState: vi.fn(() => ({
      window: {
        bounds: { x: 0, y: 0, width: 800, height: 600 },
        maximized: false,
        fullscreen: false
      }
    })),
    updateWindow: vi.fn(),
    flushSync: vi.fn()
  }
}))
vi.mock('./window-state', () => ({
  safeWindowBounds: vi.fn(
    (bounds: { x: number; y: number; width: number; height: number }) => bounds
  ),
  workAreasFromDisplays: vi.fn(() => [])
}))

describe('main startup ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
    mocks.order.length = 0
    mocks.appHandlers.clear()
    mocks.windowOptions.length = 0
  })

  it('creates the first window before initializing the index store', async () => {
    await import('./index')
    await vi.waitFor(() => expect(mocks.order).toContain('indexer:init'))

    expect(mocks.order.indexOf('window:create')).toBeLessThan(mocks.order.indexOf('indexer:init'))
  })

  it('sets the saved color mode before the first window exists, so it never paints in the wrong theme', async () => {
    await import('./index')
    // Also wait for the deferred index start, so nothing outlives this test.
    await vi.waitFor(() => expect(mocks.order).toContain('indexer:init'))

    expect(mocks.order.indexOf('theme:dark')).toBeGreaterThanOrEqual(0)
    expect(mocks.order.indexOf('theme:dark')).toBeLessThan(mocks.order.indexOf('window:create'))
  })

  it('uses title case for native app and window names', async () => {
    await import('./index')
    await vi.waitFor(() => expect(mocks.windowOptions).toHaveLength(1))
    await vi.waitFor(() => expect(mocks.indexerInit).toHaveBeenCalledOnce())

    expect(mocks.app.setName).toHaveBeenCalledWith('Ryte')
    expect(mocks.windowOptions[0]?.title).toBe('Ryte')
  })

  it('test_reactivating_a_window_does_not_restart_initialized_indexing', async () => {
    await import('./index')
    await vi.waitFor(() => expect(mocks.indexerInit).toHaveBeenCalledOnce())

    mocks.appHandlers.get('activate')?.()
    await new Promise<void>((resolve) => setImmediate(resolve))
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(mocks.indexerInit).toHaveBeenCalledOnce()
  })
})
