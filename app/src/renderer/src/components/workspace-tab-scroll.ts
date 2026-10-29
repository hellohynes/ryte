export interface ScrollIntoViewGeometry {
  viewportStart: number
  viewportEnd: number
  itemStart: number
  itemEnd: number
  margin?: number
}

export interface OverflowGeometry {
  scrollLeft: number
  scrollWidth: number
  clientWidth: number
  threshold?: number
}

export interface OverflowEdges {
  canScrollLeft: boolean
  canScrollRight: boolean
}

export function resolveScrollDelta({
  viewportStart,
  viewportEnd,
  itemStart,
  itemEnd,
  margin = 0
}: ScrollIntoViewGeometry): number {
  const viewportWidth = Math.max(0, viewportEnd - viewportStart)
  const safeMargin = Math.min(Math.max(0, margin), viewportWidth / 2)
  const visibleStart = viewportStart + safeMargin
  const visibleEnd = viewportEnd - safeMargin
  const itemWidth = Math.max(0, itemEnd - itemStart)
  const visibleWidth = Math.max(0, visibleEnd - visibleStart)

  if (itemWidth > visibleWidth) {
    if (itemStart < viewportStart) return itemStart - viewportStart
    if (itemEnd > viewportEnd) return itemEnd - viewportEnd
    return 0
  }

  if (itemStart < visibleStart) return itemStart - visibleStart
  if (itemEnd > visibleEnd) return itemEnd - visibleEnd
  return 0
}

export function resolveOverflowEdges({
  scrollLeft,
  scrollWidth,
  clientWidth,
  threshold = 1
}: OverflowGeometry): OverflowEdges {
  const maxScrollLeft = Math.max(0, scrollWidth - clientWidth)
  const safeScrollLeft = Math.min(Math.max(0, scrollLeft), maxScrollLeft)

  return {
    canScrollLeft: safeScrollLeft > threshold,
    canScrollRight: safeScrollLeft < maxScrollLeft - threshold
  }
}
