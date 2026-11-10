import { z } from 'zod'

import { defineArea, defineOperation } from './define'
import { sourcePath } from './primitives'

/** A video by its path relative to the notes folder. */
const videoInput = z.strictObject({ path: sourcePath })

const videoProblem = z.object({
  reason: z.enum(['missing', 'blocked', 'unplayable']),
  // Known when the file was found.
  sizeBytes: z.number().nullable()
})

export const explain = defineOperation({
  channel: 'video:explain',
  description:
    'Why a video from the notes folder did not play: `missing`, `blocked` (outside the notes folder, or not a type Ryte plays), or `unplayable` (it passes every check but the player could not play it, for example a codec Chromium does not support). Carries the size in bytes when the file was found.',
  input: videoInput,
  output: videoProblem,
  example: {
    input: { path: 'clips/demo.mov' },
    output: { reason: 'unplayable', sizeBytes: 48_213_004 }
  }
})

export const openInDefaultApp = defineOperation({
  channel: 'video:open-in-default-app',
  description:
    'Open an MP4, WebM or MOV video from the notes folder in its default app, after checking again that it is inside the notes folder and of one of those types. Every other type is refused. Returns whether it opened.',
  input: videoInput,
  output: z.object({ opened: z.boolean() }),
  example: { input: { path: 'clips/demo.mov' }, output: { opened: true } }
})

export const video = defineArea('video', {
  operations: { explain, openInDefaultApp },
  events: {}
})

export type VideoProblem = z.output<typeof videoProblem>
