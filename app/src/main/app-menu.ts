import { app, Menu, type MenuItemConstructorOptions } from 'electron'

import {
  isWorkspaceSourceFileRef,
  workspaceFileDisplayPath,
  workspaceFileTitle,
  type WorkspaceOpenRecentFileInput,
  type WorkspaceRecentFile
} from '../shared/workspace'
import type { MenuCommandSender } from './menu-command'
import { workspaceStore } from './workspace/workspace-store'

const APP_NAME = 'ryte'
const RECENT_MENU_LIMIT = 10
const commandKey = process.platform === 'darwin' ? 'Command' : 'Ctrl'
const optionKey = process.platform === 'darwin' ? 'Alt' : 'Alt'

// Set by `installAppMenu`. The menu is rebuilt when the recent files change, and each rebuild keeps the sender.
let sendMenuCommand: MenuCommandSender = () => undefined
let installed = false

function recentLabel(recent: WorkspaceRecentFile): string {
  return recent.title || workspaceFileTitle(recent)
}

function recentFileInput(recent: WorkspaceRecentFile): WorkspaceOpenRecentFileInput {
  return isWorkspaceSourceFileRef(recent)
    ? { sourcePath: recent.sourcePath }
    : { externalPath: recent.externalPath }
}

function recentMenuItems(): MenuItemConstructorOptions[] {
  const recents = workspaceStore.publicState().recents.slice(0, RECENT_MENU_LIMIT)
  if (recents.length === 0) {
    return [{ label: 'No Recent Files', enabled: false }]
  }

  return recents.map((recent) => ({
    label: recentLabel(recent),
    toolTip: workspaceFileDisplayPath(recent),
    click: () => sendMenuCommand({ type: 'open-recent-file', file: recentFileInput(recent) })
  }))
}

function appMenu(): MenuItemConstructorOptions {
  return {
    label: APP_NAME,
    submenu: [
      { role: 'about', label: `About ${APP_NAME}` },
      { type: 'separator' },
      {
        label: 'Settings...',
        accelerator: `${commandKey}+,`,
        click: () => sendMenuCommand({ type: 'open-settings' })
      },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide', label: `Hide ${APP_NAME}` },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  }
}

function fileMenu(): MenuItemConstructorOptions {
  return {
    label: 'File',
    submenu: [
      {
        label: 'Open...',
        accelerator: `${commandKey}+O`,
        click: () => sendMenuCommand({ type: 'open-native-file' })
      },
      {
        label: 'Open Recent',
        submenu: recentMenuItems()
      },
      { type: 'separator' },
      {
        label: 'Close Tab',
        accelerator: `${commandKey}+W`,
        click: () => sendMenuCommand({ type: 'close-active-tab' })
      },
      {
        label: 'Close All',
        accelerator: `${optionKey}+${commandKey}+W`,
        click: () => sendMenuCommand({ type: 'close-all-tabs' })
      }
    ]
  }
}

function editMenu(): MenuItemConstructorOptions {
  return {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    ]
  }
}

function viewMenu(): MenuItemConstructorOptions {
  return {
    label: 'View',
    submenu: [
      {
        label: 'Toggle Sidebar',
        accelerator: `${commandKey}+B`,
        click: () => sendMenuCommand({ type: 'toggle-sidebar' })
      },
      { type: 'separator' },
      {
        label: 'View Source',
        accelerator: `${commandKey}+E`,
        click: () => sendMenuCommand({ type: 'toggle-source-mode' })
      },
      {
        // The menu cannot know the active tab, so it is always on; the window ignores it for a tab that is not a page.
        label: 'Open in Browser',
        click: () => sendMenuCommand({ type: 'open-in-browser' })
      },
      { type: 'separator' },
      {
        label: 'Next',
        accelerator: `${commandKey}+Shift+]`,
        click: () => sendMenuCommand({ type: 'focus-next-tab' })
      },
      {
        label: 'Previous',
        accelerator: `${commandKey}+Shift+[`,
        click: () => sendMenuCommand({ type: 'focus-previous-tab' })
      },
      {
        label: 'Reload',
        role: 'reload',
        accelerator: `${commandKey}+R`
      },
      {
        label: 'Toggle Developer Tools',
        role: 'toggleDevTools',
        accelerator: `${optionKey}+${commandKey}+I`
      }
    ]
  }
}

function windowMenu(): MenuItemConstructorOptions {
  return {
    label: 'Window',
    submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
  }
}

export function installAppMenu(send: MenuCommandSender): void {
  sendMenuCommand = send
  installed = true
  app.setName(APP_NAME)
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([appMenu(), fileMenu(), editMenu(), viewMenu(), windowMenu()])
  )
}

/** Rebuilds the menu. Does nothing before `installAppMenu`: a menu without a sender would do nothing when clicked. */
export function refreshAppMenu(): void {
  if (installed) installAppMenu(sendMenuCommand)
}
