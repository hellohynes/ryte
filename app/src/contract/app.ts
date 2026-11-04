import { z } from 'zod'

import { defineArea, defineOperation } from './define'

export const getVersion = defineOperation({
  channel: 'app:get-version',
  description: 'The version of the running app, as shown in Preferences.',
  input: z.undefined(),
  output: z.string(),
  example: { input: undefined, output: '0.1.0' }
})

export const app = defineArea('app', {
  operations: { getVersion },
  events: {}
})
