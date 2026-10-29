import { app, BrowserWindow, Notification, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import icon from '../../resources/icon.png?asset'

import { installAppMenu } from './app-menu'
import { applyColorMode } from './appearance'
import { indexerService } from './indexing/indexer-service'
import { watcher } from './indexing/watcher'
import { registerIpc } from './ipc'
import { installNavigationGuards, originForUrl } from './navigation'
import { settingsStore } from './settings/settings-store'
import { workspaceStore } from './workspace/workspace-store'
import { safeWindowBounds, workAreasFromDisplays } from './window-state'
import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH } from '../shared/workspace'

const macOSVibrancyMaterial = 'hud' as const
let hasInitializedIndexing = false

// An explicit profile override keeps automated launch verification isolated
// from a developer's normal local workspace. It must be applied before
// `whenReady`, because the settings, workspace, and index paths all derive
// from Electron's userData location.
const userDataDirOverride = process.env['RYTE_USER_DATA_DIR']
if (userDataDirOverride) app.setPath('userData', userDataDirOverride)

// Set early so macOS notifications show "Ryte" as the source instead of
// "Electron" (only relevant in dev — packaged builds use CFBundleName).
app.setName('Ryte')

function createWindow(): BrowserWindow {
  const rendererUrl = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined
  const rendererOrigin = rendererUrl ? originForUrl(rendererUrl) : null
  const allowedAppOrigins = new Set(rendererOrigin ? [rendererOrigin] : [])
  const workspace = workspaceStore.publicState()
  const bounds = safeWindowBounds(
    workspace.window.bounds,
    workAreasFromDisplays(screen.getAllDisplays())
  )

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#CC0A090B',
    title: 'Ryte',
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hidden' as const,
          trafficLightPosition: { x: 20, y: 22 },
          transparent: true,
          vibrancy: macOSVibrancyMaterial,
          visualEffectState: 'active' as const
        }
      : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  installWindowStatePersistence(mainWindow)

  mainWindow.on('ready-to-show', () => {
    if (process.platform === 'darwin') {
      mainWindow.setBackgroundColor('#00000000')
      mainWindow.setVibrancy(macOSVibrancyMaterial)
    }
    const state = workspaceStore.publicState().window
    if (state.maximized) mainWindow.maximize()
    if (state.fullscreen) mainWindow.setFullScreen(true)
    mainWindow.show()
  })

  installNavigationGuards(mainWindow, allowedAppOrigins)

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function installWindowStatePersistence(window: BrowserWindow): void {
  let pending: ReturnType<typeof setTimeout> | null = null

  const persistNow = (): void => {
    if (pending) clearTimeout(pending)
    workspaceStore.updateWindow({
      bounds: window.getNormalBounds(),
      maximized: window.isMaximized(),
      fullscreen: window.isFullScreen()
    })
    workspaceStore.flushSync()
    pending = null
  }

  const persist = (): void => {
    if (pending) clearTimeout(pending)
    pending = setTimeout(persistNow, 250)
  }

  window.on('resized', persist)
  window.on('moved', persist)
  window.on('maximize', persist)
  window.on('unmaximize', persist)
  window.on('enter-full-screen', persist)
  window.on('leave-full-screen', persist)
  window.on('close', persistNow)
}

function reportStartupFailure(error: unknown): void {
  console.error('Ryte failed during startup.', error)
  app.exit(1)
}

function initializeIndexingAfterFirstPaint(): void {
  if (hasInitializedIndexing) return
  const ready = indexerService.init()
  if (!ready) return
  hasInitializedIndexing = true
  watcher.start(settingsStore.load().notesRoot)
  void indexerService.triggerReindex()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
function startApp(): void {
  electronApp.setAppUserModelId('com.joshuahynes.ryte')
  if (process.platform === 'darwin') {
    app.dock?.setIcon(icon)
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpc()
  installAppMenu()

  let lastNotifiedPhase: string | null = null
  indexerService.subscribe((status) => {
    if (status.phase === 'done' && lastNotifiedPhase === 'indexing') {
      if (Notification.isSupported()) {
        new Notification({
          title: 'Ryte',
          body: `Index ready: ${status.chunksTotal} chunks across ${status.filesTotal} files`
        }).show()
      }
    }
    lastNotifiedPhase = status.phase
  })

  // Before the window exists, so its first paint already has the chosen theme.
  applyColorMode(settingsStore.load().colorMode)
  const mainWindow = createWindow()
  mainWindow.once('ready-to-show', () => {
    setImmediate(initializeIndexingAfterFirstPaint)
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      const window = createWindow()
      window.once('ready-to-show', () => {
        setImmediate(initializeIndexingAfterFirstPaint)
      })
    }
  })
}

void app.whenReady().then(startApp).catch(reportStartupFailure)

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
