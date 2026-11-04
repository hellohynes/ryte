import { contract } from '../contract'
import type { AppMenuCommand } from '../contract/app'
import type { EmitTo, WindowLike } from './contract/register'

/**
 * The window a menu command goes to: the focused one, else the first. Only one window ever gets it, so a
 * command such as "close tab" cannot act in a window the person is not looking at.
 */
export function pickMenuTarget<TWindow>(
  getFocused: () => TWindow | null,
  getAll: () => readonly TWindow[]
): TWindow | null {
  return getFocused() ?? getAll()[0] ?? null
}

export type MenuCommandSender = (command: AppMenuCommand) => void

/** Builds the sender the application menu calls. With no window, the command is dropped. */
export function createMenuCommandSender(deps: {
  emitTo: EmitTo
  getFocused: () => WindowLike | null
  getAll: () => readonly WindowLike[]
}): MenuCommandSender {
  return (command) => {
    const target = pickMenuTarget(deps.getFocused, deps.getAll)
    if (target) deps.emitTo(target.webContents, contract.app.events.menuCommand, command)
  }
}
