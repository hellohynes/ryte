import { z } from 'zod'

import { MAX_LOCAL_ADDRESS_LENGTH } from '../shared/local-address'
import { defineArea, defineOperation } from './define'

const address = z.string().min(1).max(MAX_LOCAL_ADDRESS_LENGTH)

export const listApprovals = defineOperation({
  channel: 'localhost:list-approvals',
  description:
    'The local addresses the person chose to always allow, as origins (scheme, host and port), oldest first.',
  input: z.undefined(),
  output: z.array(z.string()),
  example: { input: undefined, output: ['http://localhost:5173'] }
})

export const removeApproval = defineOperation({
  channel: 'localhost:remove-approval',
  description:
    'Forget an always-allowed origin and close any open view of it, so the next open asks again. Returns the remaining origins.',
  input: z.strictObject({ origin: address }),
  output: z.array(z.string()),
  example: { input: { origin: 'http://localhost:5173' }, output: [] }
})

export const open = defineOperation({
  channel: 'localhost:open',
  description:
    'Approve opening a local address after the person answered the prompt. `always` remembers the origin; `once` allows it until the tab closes. Refuses anything that is not `http` or `https` on `localhost`, `127.0.0.1` or `[::1]`. Returns the address to open in a tab, or why not.',
  input: z.strictObject({ url: address, choice: z.enum(['once', 'always']) }),
  output: z.discriminatedUnion('status', [
    z.object({ status: z.literal('ok'), url: z.string(), origin: z.string() }),
    z.object({ status: z.literal('refused') })
  ]),
  example: {
    input: { url: 'http://localhost:5173', choice: 'always' },
    output: { status: 'ok', url: 'http://localhost:5173/', origin: 'http://localhost:5173' }
  }
})

export const release = defineOperation({
  channel: 'localhost:release',
  description:
    'A tab opened with `once` was closed: forget that one-time allowance. An always-allowed origin is not affected.',
  input: z.strictObject({ url: address }),
  output: z.void(),
  example: { input: { url: 'http://localhost:5173/' }, output: undefined }
})

export const localhost = defineArea('localhost', {
  operations: { listApprovals, removeApproval, open, release },
  events: {}
})
