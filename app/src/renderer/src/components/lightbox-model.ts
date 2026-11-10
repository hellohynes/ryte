/** One picture in the lightbox. A note supplies its pictures; a queue folder can supply its own later. */
export interface LightboxPicture {
  src: string
  alt: string
  /** Where the picture came from, such as its notes-relative path. */
  origin: string
}

/** A picture on the page, by the position its button carries. */
export interface PagePicture extends LightboxPicture {
  index: number
  /** False once the picture failed to load. One still waiting to load (lazily) counts as loaded. */
  loaded: boolean
}

/**
 * The lightbox list for a click on the picture at `clickedIndex`: the pictures that did not fail, in reading
 * order, and where the clicked one sits in it. Null when the clicked picture is not in that list.
 */
export function buildLightboxList(
  pagePictures: readonly PagePicture[],
  clickedIndex: number
): { pictures: LightboxPicture[]; start: number } | null {
  const loaded = pagePictures.filter((p) => p.loaded).sort((a, b) => a.index - b.index)
  const start = loaded.findIndex((p) => p.index === clickedIndex)
  if (start < 0) return null
  return { pictures: loaded.map(({ src, alt, origin }) => ({ src, alt, origin })), start }
}

/** The position after a step back or forward. It stops at the first and last picture. */
export function stepLightbox(index: number, count: number, step: -1 | 1): number {
  return Math.min(Math.max(index + step, 0), Math.max(count - 1, 0))
}
