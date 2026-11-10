import { z } from 'zod'

import { defineArea, defineOperation } from './define'
import { sourcePath } from './primitives'

/** A picture by its path relative to the notes folder. */
const pictureInput = z.strictObject({ path: sourcePath })

const pictureProblem = z.object({
  reason: z.enum(['too-large', 'missing', 'blocked', 'unreadable']),
  // Known when the file was found.
  sizeBytes: z.number().nullable()
})

export const explain = defineOperation({
  channel: 'pictures:explain',
  description:
    'Why a picture from the notes folder did not show: `too-large` (over the 50 MB cap), `missing`, `blocked` (outside the notes folder, or not a type Ryte shows), or `unreadable` (it passes every check but did not load). Carries the size in bytes when the file was found.',
  input: pictureInput,
  output: pictureProblem,
  example: {
    input: { path: 'images/scan.png' },
    output: { reason: 'too-large', sizeBytes: 66_060_288 }
  }
})

export const openInDefaultApp = defineOperation({
  channel: 'pictures:open-in-default-app',
  description:
    'Open a PNG, JPEG, GIF, WebP or AVIF picture from the notes folder in its default app, after checking again that it is inside the notes folder and of that type. SVG and every other type are refused. Returns whether it opened.',
  input: pictureInput,
  output: z.object({ opened: z.boolean() }),
  example: { input: { path: 'images/scan.png' }, output: { opened: true } }
})

export const pictures = defineArea('pictures', {
  operations: { explain, openInDefaultApp },
  events: {}
})

export type PictureProblem = z.output<typeof pictureProblem>
