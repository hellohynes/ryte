// NON-SHIPPED fixtures. The `tasks` pilot has no event payload and no sender-aware handler, so these
// definitions exercise those shapes for the registrar (V2) and the preload builder (V3) tests. They are
// not in the registry, so they are never exposed.
import { z } from 'zod'

import { defineEvent, defineOperation } from '../define'

export const fixtureStatusEvent = defineEvent({
  channel: 'fixture:status-event',
  description: 'A payload-bearing event, like the indexer status event.',
  payload: z.object({ phase: z.enum(['idle', 'working']), done: z.number() })
})

export const fixtureWhoAmI = defineOperation({
  channel: 'fixture:who-am-i',
  description:
    'An operation whose handler needs the calling window (ctx.sender), like dialog operations.',
  input: z.undefined(),
  output: z.object({ senderId: z.number() }),
  example: { input: undefined, output: { senderId: 1 } }
})
