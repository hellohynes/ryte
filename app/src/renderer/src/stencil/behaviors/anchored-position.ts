/**
 * Where a floating element goes relative to an anchor: on the requested side, flipped to the other
 * side when it would not fit, and kept inside the viewport. The anchor is a plain rect, so it can be a
 * pointer position, a text selection, or an element. Pure, so it runs in node tests.
 *
 * SHORTCUT: placement is computed in script. Element anchors could use CSS anchor positioning
 * instead; switch when a surface needs it, since pointer and selection anchors still need numbers.
 */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type Side = 'top' | 'bottom' | 'left' | 'right'
export type Align = 'start' | 'center' | 'end'

export interface PlacementInput {
  anchor: Rect
  size: { width: number; height: number }
  viewport: { width: number; height: number }
  side?: Side
  align?: Align
  /** Gap between anchor and floating element. Default 4. */
  offset?: number
  /** Minimum distance from the viewport edge. Default 8. */
  margin?: number
}

export interface Placement {
  left: number
  top: number
  /** The side actually used, after any flip. */
  side: Side
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

export function placeFloating(input: PlacementInput): Placement {
  const { anchor, size, viewport } = input
  const offset = input.offset ?? 4
  const margin = input.margin ?? 8
  const align = input.align ?? 'start'
  const wanted = input.side ?? 'bottom'

  const room: Record<Side, number> = {
    top: anchor.y - margin,
    bottom: viewport.height - (anchor.y + anchor.height) - margin,
    left: anchor.x - margin,
    right: viewport.width - (anchor.x + anchor.width) - margin
  }
  const need = (side: Side): number =>
    (side === 'top' || side === 'bottom' ? size.height : size.width) + offset
  const side =
    room[wanted] >= need(wanted) || room[OPPOSITE[wanted]] <= room[wanted]
      ? wanted
      : OPPOSITE[wanted]

  const alongX = (): number =>
    align === 'start'
      ? anchor.x
      : align === 'end'
        ? anchor.x + anchor.width - size.width
        : anchor.x + (anchor.width - size.width) / 2
  const alongY = (): number =>
    align === 'start'
      ? anchor.y
      : align === 'end'
        ? anchor.y + anchor.height - size.height
        : anchor.y + (anchor.height - size.height) / 2

  const rawLeft =
    side === 'left'
      ? anchor.x - size.width - offset
      : side === 'right'
        ? anchor.x + anchor.width + offset
        : alongX()
  const rawTop =
    side === 'top'
      ? anchor.y - size.height - offset
      : side === 'bottom'
        ? anchor.y + anchor.height + offset
        : alongY()

  const clamp = (value: number, extent: number, limit: number): number =>
    Math.max(margin, Math.min(value, limit - extent - margin))
  return {
    left: clamp(rawLeft, size.width, viewport.width),
    top: clamp(rawTop, size.height, viewport.height),
    side
  }
}
