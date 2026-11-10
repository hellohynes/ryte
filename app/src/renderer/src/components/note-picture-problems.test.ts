import { describe, expect, it } from 'vitest'

import { describePictureProblem } from './note-picture-problems'

describe('describePictureProblem', () => {
  it('names a picture over the cap with its size and offers to open a raster type', () => {
    expect(
      describePictureProblem({ reason: 'too-large', sizeBytes: 66_060_288 }, 'scans/big scan.JPG')
    ).toEqual({ detail: 'big scan.JPG, 63 MB, too large to show here.', canOpen: true })
  })

  it('never offers to open an SVG', () => {
    expect(
      describePictureProblem({ reason: 'too-large', sizeBytes: 60_000_000 }, 'huge.svg').canOpen
    ).toBe(false)
  })
})
