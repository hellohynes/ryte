/**
 * The props of StStack and StBox, and how they become `data-st-*` attributes. The values are token
 * stops, so a component cannot be given a size or color outside the scales. `layout.css` (generated
 * from these lists) turns each attribute into a declaration that reads a token.
 */

export const SPACE_STOP_LIST = [
  0, 1, 25, 50, 75, 100, 125, 150, 175, 200, 250, 300, 350, 400, 450, 500, 525, 550, 600, 650, 700,
  750, 800, 850, 900, 950, 1000, 1050, 1100, 1150, 1200, 1250
] as const

export type SpaceStop = (typeof SPACE_STOP_LIST)[number]

export const STACK_GAPS: readonly SpaceStop[] = SPACE_STOP_LIST
export const BOX_SPACE: readonly SpaceStop[] = SPACE_STOP_LIST

export const STACK_DIRECTIONS = ['column', 'row'] as const
export const STACK_ALIGN = ['start', 'center', 'end', 'stretch', 'baseline'] as const
export const STACK_JUSTIFY = ['start', 'center', 'end', 'between', 'around'] as const

export const BOX_SURFACES = ['sunken', 'base', 'raised', 'floating'] as const
export const BOX_EDGES = ['subtle', 'base', 'strong', 'contrast'] as const
export const BOX_SHADOWS = ['sm', 'md', 'lg', 'xl'] as const
export const BOX_RADII = [50, 75, 100, 150, 200, 300, 'pill', 'circle'] as const

export interface StackProps {
  /** Default `column`. */
  direction?: (typeof STACK_DIRECTIONS)[number]
  gap?: SpaceStop
  align?: (typeof STACK_ALIGN)[number]
  justify?: (typeof STACK_JUSTIFY)[number]
  wrap?: boolean
}

export interface BoxProps {
  surface?: (typeof BOX_SURFACES)[number]
  /** A real border of this emphasis. */
  border?: (typeof BOX_EDGES)[number]
  /** An inset edge of this emphasis that does not change layout. */
  ring?: (typeof BOX_EDGES)[number]
  radius?: (typeof BOX_RADII)[number]
  shadow?: (typeof BOX_SHADOWS)[number]
  padding?: SpaceStop
  paddingX?: SpaceStop
  paddingY?: SpaceStop
}

type Attributes = Record<string, string>

/** Adds `data-st-<name>` for each value that is set. */
function attributes(values: Record<string, string | number | boolean | undefined>): Attributes {
  const out: Attributes = {}
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined || value === false) continue
    out[`data-st-${name}`] = value === true ? '' : String(value)
  }
  return out
}

export function stackAttributes(props: StackProps): Attributes {
  const { direction, gap, align, justify, wrap } = props
  return attributes({ direction, gap, align, justify, wrap })
}

export function boxAttributes(props: BoxProps): Attributes {
  const { surface, border, ring, radius, shadow, padding, paddingX, paddingY } = props
  return attributes({
    surface,
    border,
    ring,
    radius,
    shadow,
    p: padding,
    px: paddingX,
    py: paddingY
  })
}
