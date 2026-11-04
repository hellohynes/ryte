import { z } from 'zod'

import { defineArea, defineEvent, defineOperation } from './define'
import { sourcePath, workspaceFileRef } from './primitives'

export const getVersion = defineOperation({
  channel: 'app:get-version',
  description: 'The version of the running app, as shown in Preferences.',
  input: z.undefined(),
  output: z.string(),
  example: { input: undefined, output: '0.1.0' }
})

/** What an application menu item asks the window to do. Every variant is one `type` plus its own fields. */
export const appMenuCommand = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('open-native-file') }),
  z.strictObject({ type: z.literal('open-source-path'), sourcePath }),
  z.strictObject({ type: z.literal('open-recent-file'), file: workspaceFileRef }),
  z.strictObject({ type: z.literal('close-active-tab') }),
  z.strictObject({ type: z.literal('close-all-tabs') }),
  z.strictObject({ type: z.literal('focus-next-tab') }),
  z.strictObject({ type: z.literal('focus-previous-tab') }),
  z.strictObject({ type: z.literal('toggle-sidebar') }),
  z.strictObject({ type: z.literal('toggle-source-mode') }),
  z.strictObject({ type: z.literal('open-settings') })
])

export type AppMenuCommand = z.output<typeof appMenuCommand>

// The key is `menuCommand` so the renderer-facing subscriber is `onMenuCommand`, as it was before the contract.
export const menuCommand = defineEvent({
  channel: 'app:menu-command',
  description:
    'A menu item was chosen. Sent to the focused window only, or the first window when none is focused.',
  payload: appMenuCommand
})

export const app = defineArea('app', {
  operations: { getVersion },
  events: { menuCommand }
})
