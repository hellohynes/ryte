import { z } from 'zod'

import { defineArea, defineOperation } from './define'

export const openFolder = defineOperation({
  channel: 'dialog:open-folder',
  description:
    'Show the system folder picker over the window that asked: the chosen folder path, or null when it was cancelled or nothing was chosen.',
  input: z.undefined(),
  output: z.string().nullable(),
  example: { input: undefined, output: '/Users/example/Notes' }
})

export const dialog = defineArea('dialog', {
  operations: { openFolder },
  events: {}
})
