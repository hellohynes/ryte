/** What a `Range` request header asks for, against a file of a known size. `end` is inclusive. */
export type ByteRangeRequest =
  | { kind: 'whole' }
  | { kind: 'range'; start: number; end: number }
  | { kind: 'malformed' }
  | { kind: 'unsatisfiable' }

const RANGE_RE = /^bytes=(\d*)-(\d*)$/i

/**
 * Reads a single `bytes=a-b`, `bytes=a-` or `bytes=-n` range. Several ranges, another unit, a reversed range
 * and anything that is not plain digits are malformed. A range that starts at or past the end of the file is
 * unsatisfiable; one that ends past it, however far, is cut at the last byte.
 */
export function parseByteRange(header: string | null | undefined, size: number): ByteRangeRequest {
  if (header === null || header === undefined) return { kind: 'whole' }

  const match = RANGE_RE.exec(header.trim())
  if (!match) return { kind: 'malformed' }
  const [, first = '', last = ''] = match
  if (first === '' && last === '') return { kind: 'malformed' }

  if (first === '') {
    const length = Number(last)
    if (!Number.isSafeInteger(length)) return { kind: 'malformed' }
    if (length === 0 || size === 0) return { kind: 'unsatisfiable' }
    return { kind: 'range', start: Math.max(0, size - length), end: size - 1 }
  }

  const start = Number(first)
  if (!Number.isSafeInteger(start)) return { kind: 'malformed' }
  // An end too large to count is read as "to the end of the file", like any end past it.
  const requestedEnd =
    last === '' || !Number.isSafeInteger(Number(last)) ? Number.POSITIVE_INFINITY : Number(last)
  if (requestedEnd < start) return { kind: 'malformed' }
  if (start >= size) return { kind: 'unsatisfiable' }
  return { kind: 'range', start, end: Math.min(requestedEnd, size - 1) }
}
