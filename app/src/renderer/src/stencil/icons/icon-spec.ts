/**
 * The Stencil icon set, drawn as centerlines on a 16px grid. `pnpm stencil:icons` outlines every
 * stroke at STROKE_WIDTH into one filled shape per icon (`icons.generated.ts`), so an icon is a
 * single `currentColor` fill that scales with its size instead of a stroke that does not.
 *
 * Forms: flat caps and rounded corners, with the live area inside 2 to 14.
 */

import { BRAND_MARKS } from './brand-marks'

export const GRID = 16
export const STROKE_WIDTH = 1.5
/** The live area: a stroke centered 2px in from the edge reaches 1.25px in. */
export const EDGE = 2 - STROKE_WIDTH / 2

type Point = [number, number]

export interface IconSpec {
  /** Stroked paths, as SVG path data. */
  strokes?: string[]
  /** Solid dots: [x, y, radius]. */
  dots?: Array<[number, number, number]>
  /** A filled shape on any box, scaled to fit the live area. For brand marks. */
  brand?: string
}

const num = (n: number): string => String(+n.toFixed(3))

/** A polyline through points. */
const line = (...points: Point[]): string =>
  points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${num(x)} ${num(y)}`).join('')

/** Rotates points a quarter turn at a time about the center of the grid. */
const turn = (points: Point[], quarters: number): Point[] =>
  points.map(([x, y]) => {
    let [px, py] = [x - GRID / 2, y - GRID / 2]
    for (let i = 0; i < ((quarters % 4) + 4) % 4; i++) [px, py] = [-py, px]
    return [px + GRID / 2, py + GRID / 2]
  })

/** A rounded rectangle outline. */
const rect = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${num(x + r)} ${num(y)}H${num(x + w - r)}A${r} ${r} 0 0 1 ${num(x + w)} ${num(y + r)}` +
  `V${num(y + h - r)}A${r} ${r} 0 0 1 ${num(x + w - r)} ${num(y + h)}H${num(x + r)}` +
  `A${r} ${r} 0 0 1 ${num(x)} ${num(y + h - r)}V${num(y + r)}A${r} ${r} 0 0 1 ${num(x + r)} ${num(y)}Z`

const circle = (cx: number, cy: number, r: number): string =>
  `M${num(cx)} ${num(cy - r)}A${r} ${r} 0 1 1 ${num(cx)} ${num(cy + r)}A${r} ${r} 0 1 1 ${num(cx)} ${num(cy - r)}Z`

const polar = (cx: number, cy: number, r: number, degrees: number): Point => [
  cx + r * Math.cos((degrees * Math.PI) / 180),
  cy + r * Math.sin((degrees * Math.PI) / 180)
]

/** An open arc from one angle to another, clockwise on screen. Angles are in degrees from the +x axis. */
const arc = (cx: number, cy: number, r: number, from: number, to: number): string => {
  const [sx, sy] = polar(cx, cy, r, from)
  const [ex, ey] = polar(cx, cy, r, to)
  return `M${num(sx)} ${num(sy)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${num(ex)} ${num(ey)}`
}

const CHEVRON_RIGHT: Point[] = [
  [6, 3.75],
  [10.25, 8],
  [6, 12.25]
]

/** An arrow is the chevron with a tail: the tail runs 4px past the head, and the pair is centered. */
const ARROW_WINGS = (GRID - (4 + 4.25)) / 2 + 4
const ARROW_APEX = ARROW_WINGS + 4.25
const ARROW_HEAD: Point[] = [
  [ARROW_WINGS, 3.75],
  [ARROW_APEX, 8],
  [ARROW_WINGS, 12.25]
]
const ARROW_SHAFT: Point[] = [
  [(GRID - (4 + 4.25)) / 2, 8],
  [ARROW_APEX, 8]
]

/** Right, down, left, up: a quarter turn each. */
const arrow = (quarters: number): IconSpec => ({
  strokes: [line(...turn(ARROW_SHAFT, quarters)), line(...turn(ARROW_HEAD, quarters))]
})
const chevron = (quarters: number): IconSpec => ({
  strokes: [line(...turn(CHEVRON_RIGHT, quarters))]
})

/** A six-lobe gear with soft, rounded teeth, drawn as one smooth closed curve. */
function gear(): string {
  const [lobes, base, amp, sharp, steps] = [6, 4.85, 0.85, 2.4, 144]
  const points: Point[] = Array.from({ length: steps }, (_, i) => {
    const t = (i / steps) * Math.PI * 2
    const r = base + (amp * Math.tanh(sharp * Math.cos(lobes * t))) / Math.tanh(sharp)
    return [8 + r * Math.cos(t), 8 + r * Math.sin(t)]
  })
  return line(...points) + 'Z'
}

/**
 * A circular arrow: a clockwise arc open at the upper right, easing into the corner of an
 * axis-aligned head. The right-angle corner reads at 16px where a swept chevron fills in.
 */
function refresh(): string[] {
  return ['M13.5 9A5.6 5.6 0 1 1 8 2.4c1.57 0 3 .6 4.2 1.6l1.6 1.6', 'M13.8 2v3.6h-3.6']
}

/** A sun: a disc and eight rays. */
function rays(): string[] {
  return Array.from({ length: 8 }, (_, i) => {
    const [a, b] = [polar(8, 8, 4.6, i * 45), polar(8, 8, 6.1, i * 45)]
    return line(a, b)
  })
}

const align = (...ends: Array<[number, number]>): string[] =>
  ends.map(([from, to], i) => line([from, 3.5 + i * 3], [to, 3.5 + i * 3]))

export const ICON_SPEC: Record<string, IconSpec> = {
  'align-center': { strokes: align([3, 13], [5, 11], [3, 13], [5, 11]) },
  'align-left': { strokes: align([3, 13], [3, 9], [3, 13], [3, 9]) },
  'align-right': { strokes: align([3, 13], [7, 13], [3, 13], [7, 13]) },
  'arrow-down': arrow(1),
  'arrow-left': arrow(2),
  'arrow-right': arrow(0),
  'arrow-up': arrow(3),
  anthropic: { brand: BRAND_MARKS.anthropic },
  bold: {
    strokes: ['M5 7.5H9.25A2.75 2.75 0 0 1 9.25 13H5V3H8.5A2.25 2.25 0 0 1 8.5 7.5H5']
  },
  check: { strokes: [line([3, 8.5], [6.25, 11.75], [13, 4.5])] },
  checklist: {
    strokes: [
      line([2.5, 4.5], [4.25, 6.25], [7, 3]),
      rect(2.5, 8.75, 4.5, 4.5, 0.75),
      line([9.25, 4.5], [13.5, 4.5]),
      line([9.25, 11], [13.5, 11])
    ]
  },
  columns: {
    strokes: [rect(2, 2.5, 12, 11, 1.5), line([6, 2.5], [6, 13.5]), line([10, 2.5], [10, 13.5])]
  },
  'chevron-down': chevron(1),
  'chevron-left': chevron(2),
  'chevron-right': chevron(0),
  'chevron-up': chevron(3),
  close: { strokes: [line([4, 4], [12, 12]), line([12, 4], [4, 12])] },
  code: {
    strokes: [
      line([5.5, 4.75], [2.25, 8], [5.5, 11.25]),
      line([10.5, 4.75], [13.75, 8], [10.5, 11.25]),
      line([9.25, 3.25], [6.75, 12.75])
    ]
  },
  'code-block': {
    strokes: [
      rect(2, 2.5, 12, 11, 1.5),
      line([6, 6.25], [4.25, 8], [6, 9.75]),
      line([10, 6.25], [11.75, 8], [10, 9.75])
    ]
  },
  connector: {
    strokes: [
      line([6, 2], [6, 5.25]),
      line([10, 2], [10, 5.25]),
      'M4.5 5.25H11.5V8A3.5 3.5 0 0 1 8 11.5A3.5 3.5 0 0 1 4.5 8Z',
      line([8, 11.5], [8, 14])
    ]
  },
  copy: {
    strokes: [
      rect(2, 6, 8.5, 8, 1.75),
      'M10.5 10H12.25A1.75 1.75 0 0 0 14 8.25V3.75A1.75 1.75 0 0 0 12.25 2H7.75A1.75 1.75 0 0 0 6 3.75V6'
    ]
  },
  drop: {
    strokes: ['M8 2.5C10.5 5.4 12 7 12 9.5A4 4 0 0 1 4 9.5C4 7 5.5 5.4 8 2.5Z']
  },
  file: {
    strokes: [
      'M4.5 2H9L13 6V12.5A1.5 1.5 0 0 1 11.5 14H4.5A1.5 1.5 0 0 1 3 12.5V3.5A1.5 1.5 0 0 1 4.5 2Z',
      'M9 2V5A1 1 0 0 0 10 6H13'
    ]
  },
  grid: {
    strokes: [
      rect(2.5, 2.5, 4.5, 4.5, 1),
      rect(9, 2.5, 4.5, 4.5, 1),
      rect(2.5, 9, 4.5, 4.5, 1),
      rect(9, 9, 4.5, 4.5, 1)
    ]
  },
  heading: {
    strokes: [line([4, 3.5], [4, 12.5]), line([12, 3.5], [12, 12.5]), line([4, 8], [12, 8])]
  },
  'heading-1': {
    strokes: [
      line([2.5, 3.5], [2.5, 12.5]),
      line([7.25, 3.5], [7.25, 12.5]),
      line([2.5, 8], [7.25, 8]),
      line([9.75, 6.25], [11.75, 4.25], [11.75, 12.5])
    ]
  },
  'heading-2': {
    strokes: [
      line([2.5, 3.5], [2.5, 12.5]),
      line([7.25, 3.5], [7.25, 12.5]),
      line([2.5, 8], [7.25, 8]),
      'M9.5 5.6A2.2 2.2 0 0 1 13.6 5.7C13.6 8 9.5 9.8 9.5 11.75H13.85'
    ]
  },
  'heading-3': {
    strokes: [
      line([2.5, 3.5], [2.5, 12.5]),
      line([7.25, 3.5], [7.25, 12.5]),
      line([2.5, 8], [7.25, 8]),
      arc(11.5, 6.15, 1.9, 200, 450),
      arc(11.5, 9.9, 1.85, 270, 520)
    ]
  },
  home: {
    strokes: [
      'M3 7.2L8 2.75L13 7.2V12.5A1.5 1.5 0 0 1 11.5 14H4.5A1.5 1.5 0 0 1 3 12.5Z',
      line([6.25, 14], [6.25, 10], [9.75, 10], [9.75, 14])
    ]
  },
  image: {
    strokes: [
      rect(2, 3, 12, 10, 1.5),
      line([2.5, 12], [6.25, 8.5], [9, 11], [11, 9.25], [13.5, 11.75])
    ],
    dots: [[5.5, 6.25, 1.1]]
  },
  italic: {
    strokes: [line([7, 3], [12, 3]), line([4, 13], [9, 13]), line([9.75, 3], [6.25, 13])]
  },
  archive: {
    strokes: [
      rect(2, 3, 12, 3, 1),
      'M3 6V12.5A1.5 1.5 0 0 0 4.5 14H11.5A1.5 1.5 0 0 0 13 12.5V6',
      line([6.5, 9], [9.5, 9])
    ]
  },
  library: {
    strokes: [
      'M8 4.5C6.7 3.5 5 3 2.5 3V12C5 12 6.7 12.5 8 13.5C9.3 12.5 11 12 13.5 12V3C11 3 9.3 3.5 8 4.5Z',
      line([8, 4.5], [8, 13.5])
    ]
  },
  link: {
    strokes: [
      'M7 5.5H4.5A2.5 2.5 0 0 0 4.5 10.5H7',
      'M9 5.5H11.5A2.5 2.5 0 0 1 11.5 10.5H9',
      line([6, 8], [10, 8])
    ]
  },
  'list-bullet': {
    strokes: [line([6.5, 4], [13.5, 4]), line([6.5, 8], [13.5, 8]), line([6.5, 12], [13.5, 12])],
    dots: [
      [3.25, 4, 1.1],
      [3.25, 8, 1.1],
      [3.25, 12, 1.1]
    ]
  },
  'list-ordered': {
    strokes: [
      line([3, 4], [4.5, 3], [4.5, 7]),
      'M2.75 9.5A1.5 1.5 0 0 1 5.5 10.1C5.5 11.2 2.75 11.9 2.75 13H5.6',
      line([8, 5], [13.5, 5]),
      line([8, 11], [13.5, 11])
    ]
  },
  openai: { brand: BRAND_MARKS.openai },
  moon: { strokes: ['M12.5 9.4A5 5 0 0 1 6.6 3.5A5 5 0 1 0 12.5 9.4Z'] },
  'more-vertical': {
    dots: [
      [8, 3.25, 1.25],
      [8, 8, 1.25],
      [8, 12.75, 1.25]
    ]
  },
  plus: { strokes: [line([8, 3], [8, 13]), line([3, 8], [13, 8])] },
  quote: {
    strokes: [
      'M3 7.25V4.5H6.5V8.25C6.5 10 5.5 11.25 3.75 11.75',
      'M9.5 7.25V4.5H13V8.25C13 10 12 11.25 10.25 11.75'
    ]
  },
  redo: {
    strokes: [line([10.5, 3.25], [13.25, 6], [10.5, 8.75]), 'M13 6H6.75A3.5 3.5 0 0 0 6.75 13H10.5']
  },
  refresh: { strokes: refresh() },
  rule: {
    strokes: [
      line([2.5, 8], [13.5, 8]),
      line([4.5, 4.5], [11.5, 4.5]),
      line([4.5, 11.5], [11.5, 11.5])
    ]
  },
  search: { strokes: [circle(7, 7, 4.75), line([10.5, 10.5], [13.75, 13.75])] },
  settings: { strokes: [gear(), circle(8, 8, 1.6)] },
  sliders: {
    strokes: [
      circle(4.75, 5, 1.75),
      line([6.5, 5], [13.5, 5]),
      line([2.5, 11], [9.5, 11]),
      circle(11.25, 11, 1.75)
    ]
  },
  sidebar: { strokes: [rect(2, 2, 12, 12, 2), line([6, 2], [6, 14])] },
  'sidebar-close': {
    strokes: [rect(2, 2, 12, 12, 2), line([6, 2], [6, 14]), line([11.5, 6], [9.5, 8], [11.5, 10])]
  },
  'sidebar-open': {
    strokes: [rect(2, 2, 12, 12, 2), line([6, 2], [6, 14]), line([9.5, 6], [11.5, 8], [9.5, 10])]
  },
  strikethrough: {
    strokes: [
      line([3, 8], [13, 8]),
      'M10.5 5.25C10.3 3.85 9.3 3 8 3C6.4 3 5.5 3.9 5.5 5.1C5.5 6.4 6.6 7 8 8C9.4 9 10.5 9.6 10.5 10.9C10.5 12.1 9.5 13 8 13C6.6 13 5.7 12.3 5.5 10.75'
    ]
  },
  sun: { strokes: [circle(8, 8, 2.4), ...rays()] },
  table: {
    strokes: [
      rect(2, 3, 12, 10, 1.5),
      line([2, 6.5], [14, 6.5]),
      line([2, 9.75], [14, 9.75]),
      line([7, 6.5], [7, 13])
    ]
  },
  type: { strokes: [line([3, 13], [8, 3], [13, 13]), line([4.9, 9.5], [11.1, 9.5])] },
  underline: {
    strokes: ['M4.75 2.5V7.25A3.25 3.25 0 0 0 11.25 7.25V2.5', line([3, 13.75], [13, 13.75])]
  },
  undo: {
    strokes: [line([5.5, 3.25], [2.75, 6], [5.5, 8.75]), 'M3 6H9.25A3.5 3.5 0 0 1 9.25 13H5.5']
  }
}
