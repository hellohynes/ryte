import { z } from 'zod'

import { defineArea, defineOperation } from './define'
import { sourcePath } from './primitives'

/** A code file by its path relative to the notes folder. */
const codeFileInput = z.strictObject({ path: sourcePath })

const codeReadResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), text: z.string(), bytes: z.number() }),
  z.object({ status: z.literal('too-large'), sizeBytes: z.number() }),
  z.object({ status: z.literal('missing') }),
  z.object({ status: z.literal('blocked') })
])

export const read = defineOperation({
  channel: 'code:read',
  description:
    'Read a code file (JSON, JavaScript, TypeScript, CSS, YAML or shell) from the notes folder as UTF-8 text with any leading byte order mark dropped. Returns `too-large` with the size when it is over the 10 MB cap (the contents are not read), `missing` when it is gone, and `blocked` when it is outside the notes folder, not a regular file, or not a code type Ryte shows. Notes and every other type are refused.',
  input: codeFileInput,
  output: codeReadResult,
  example: {
    input: { path: 'scripts/build.ts' },
    output: { status: 'ok', text: 'export const answer = 42\n', bytes: 25 }
  }
})

export const openInDefaultApp = defineOperation({
  channel: 'code:open-in-default-app',
  description:
    'Open a code file from the notes folder in its default app, after checking again that it is inside the notes folder and of a code type. Shell scripts are refused, so a script is never run by opening it. Returns whether it opened.',
  input: codeFileInput,
  output: z.object({ opened: z.boolean() }),
  example: { input: { path: 'data/config.json' }, output: { opened: true } }
})

export const code = defineArea('code', {
  operations: { read, openInDefaultApp },
  events: {}
})

export type CodeReadResult = z.output<typeof codeReadResult>
