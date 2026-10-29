import paper from 'paper'
import { beforeAll, describe, expect, it } from 'vitest'

import { EDGE, GRID, ICON_SPEC } from './icon-spec'
import { ICON_NAMES, ICON_PATHS } from './icons.generated'

const EXPECTED = [
  'align-center',
  'align-left',
  'align-right',
  'anthropic',
  'archive',
  'arrow-down',
  'arrow-left',
  'arrow-right',
  'arrow-up',
  'bold',
  'check',
  'checklist',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'chevron-up',
  'close',
  'code',
  'code-block',
  'columns',
  'connector',
  'copy',
  'drop',
  'file',
  'grid',
  'heading',
  'heading-1',
  'heading-2',
  'heading-3',
  'home',
  'image',
  'italic',
  'library',
  'link',
  'list-bullet',
  'list-ordered',
  'moon',
  'more-vertical',
  'openai',
  'plus',
  'quote',
  'redo',
  'refresh',
  'rule',
  'search',
  'settings',
  'sidebar',
  'sidebar-close',
  'sidebar-open',
  'sliders',
  'strikethrough',
  'sun',
  'table',
  'type',
  'underline',
  'undo'
]

const bounds = (name: string): paper.Rectangle =>
  new paper.CompoundPath(ICON_PATHS[name as never]).bounds

describe('icon set', () => {
  beforeAll(() => {
    paper.setup(new paper.Size(GRID, GRID))
  })

  it('has the agreed icons, one drawing each', () => {
    expect([...ICON_NAMES]).toEqual(EXPECTED)
    expect(Object.keys(ICON_SPEC).sort()).toEqual(EXPECTED)
    expect(Object.keys(ICON_PATHS).sort()).toEqual(EXPECTED)
  })

  it('draws every icon as one filled outline of plain path commands', () => {
    for (const name of EXPECTED) {
      const d = ICON_PATHS[name as never]
      expect(d, name).toMatch(/^M[-\d.]/)
      expect(d, name).toMatch(/^[MmLlHhVvCcSsQqTtAaZz\d\s.,-]+$/)
      expect(d, name).not.toMatch(/NaN|undefined/)
    }
  })

  it('keeps every icon inside the grid with room for the edge', () => {
    for (const name of EXPECTED) {
      const { x, y, width, height } = bounds(name)
      expect(x, name).toBeGreaterThanOrEqual(EDGE - 0.02)
      expect(y, name).toBeGreaterThanOrEqual(EDGE - 0.02)
      expect(x + width, name).toBeLessThanOrEqual(GRID - EDGE + 0.02)
      expect(y + height, name).toBeLessThanOrEqual(GRID - EDGE + 0.02)
    }
  })

  it('mirrors left and right, and up and down', () => {
    const near = (a: number, b: number): void => expect(a).toBeCloseTo(b, 1)
    for (const [a, b] of [
      ['chevron-left', 'chevron-right'],
      ['arrow-left', 'arrow-right']
    ]) {
      near(bounds(a).x, GRID - (bounds(b).x + bounds(b).width))
      near(bounds(a).width, bounds(b).width)
    }
    for (const [a, b] of [
      ['chevron-up', 'chevron-down'],
      ['arrow-up', 'arrow-down']
    ]) {
      near(bounds(a).y, GRID - (bounds(b).y + bounds(b).height))
      near(bounds(a).height, bounds(b).height)
    }
  })

  it('draws a chevron and an arrow as different shapes, with the arrow longer', () => {
    expect(bounds('arrow-right').width).toBeGreaterThan(bounds('chevron-right').width + 3)
    expect(ICON_PATHS['arrow-right']).not.toBe(ICON_PATHS['chevron-right'])
  })

  it('draws sidebar-close as sidebar-open with the chevron turned', () => {
    const [open, close] = [bounds('sidebar-open'), bounds('sidebar-close')]
    expect(close.width).toBeCloseTo(open.width, 1)
    expect(close.height).toBeCloseTo(open.height, 1)
    expect(ICON_PATHS['sidebar-close']).not.toBe(ICON_PATHS['sidebar-open'])
  })

  it('sets the heading digits on the cap height of the H', () => {
    const h = bounds('heading')
    for (const name of ['heading-1', 'heading-2', 'heading-3']) {
      expect(bounds(name).y, name).toBeCloseTo(h.y, 1)
      expect(bounds(name).height, name).toBeCloseTo(h.height, 1)
    }
  })

  it('keeps the dots of more-vertical on one vertical line', () => {
    const { x, width } = bounds('more-vertical')
    expect(x + width / 2).toBeCloseTo(GRID / 2, 1)
  })
})
