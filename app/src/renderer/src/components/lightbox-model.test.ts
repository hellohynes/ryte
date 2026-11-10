import { describe, expect, it } from 'vitest'

import { buildLightboxList, stepLightbox, type PagePicture } from './lightbox-model'

const picture = (index: number, loaded = true): PagePicture => ({
  index,
  loaded,
  src: `ryte-file://notes/${index}.png`,
  alt: `Picture ${index}`,
  origin: `${index}.png`
})

describe('buildLightboxList', () => {
  it('lists only pictures that did not fail, in reading order, starting at the clicked one', () => {
    expect(buildLightboxList([picture(2), picture(0), picture(1, false), picture(3)], 2)).toEqual({
      pictures: [
        { src: 'ryte-file://notes/0.png', alt: 'Picture 0', origin: '0.png' },
        { src: 'ryte-file://notes/2.png', alt: 'Picture 2', origin: '2.png' },
        { src: 'ryte-file://notes/3.png', alt: 'Picture 3', origin: '3.png' }
      ],
      start: 1
    })
  })
})

describe('stepLightbox', () => {
  it('moves back and forward and stops at the first and last picture', () => {
    expect(stepLightbox(1, 4, 1)).toBe(2)
    expect(stepLightbox(1, 4, -1)).toBe(0)
    expect(stepLightbox(0, 4, -1)).toBe(0)
    expect(stepLightbox(3, 4, 1)).toBe(3)
  })
})
