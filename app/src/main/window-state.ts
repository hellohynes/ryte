import type { Rectangle } from 'electron'

import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  type WindowBounds
} from '../shared/workspace'

const WINDOW_MARGIN = 24
const MIN_VISIBLE_WIDTH = 120
const MIN_VISIBLE_HEIGHT = 80

export interface DisplayWorkArea {
  x: number
  y: number
  width: number
  height: number
}

function areaIntersection(a: WindowBounds, b: DisplayWorkArea): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return xOverlap * yOverlap
}

function chooseWorkArea(saved: WindowBounds | null, workAreas: DisplayWorkArea[]): DisplayWorkArea {
  if (workAreas.length === 0) {
    return { x: 0, y: 0, width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT }
  }
  if (!saved) return workAreas[0]

  const ranked = [...workAreas].sort(
    (a, b) => areaIntersection(saved, b) - areaIntersection(saved, a)
  )
  return ranked[0]
}

function visibleEnough(bounds: WindowBounds, area: DisplayWorkArea): boolean {
  const intersection = areaIntersection(bounds, area)
  return intersection >= MIN_VISIBLE_WIDTH * MIN_VISIBLE_HEIGHT
}

function clampSize(preferred: number, min: number, available: number): number {
  const usable = Math.max(1, available - WINDOW_MARGIN)
  return Math.min(Math.max(preferred, Math.min(min, usable)), usable)
}

export function safeWindowBounds(
  saved: WindowBounds | null,
  workAreas: DisplayWorkArea[]
): WindowBounds {
  const area = chooseWorkArea(saved, workAreas)
  const source = saved && visibleEnough(saved, area) ? saved : null
  const preferredWidth = source?.width ?? DEFAULT_WINDOW_WIDTH
  const preferredHeight = source?.height ?? DEFAULT_WINDOW_HEIGHT
  const width = clampSize(preferredWidth, MIN_WINDOW_WIDTH, area.width)
  const height = clampSize(preferredHeight, MIN_WINDOW_HEIGHT, area.height)
  if (!source) {
    return {
      x: area.x + Math.round((area.width - width) / 2),
      y: area.y + Math.round((area.height - height) / 2),
      width,
      height
    }
  }
  const x = Math.min(Math.max(source.x, area.x), area.x + area.width - width)
  const y = Math.min(Math.max(source.y, area.y), area.y + area.height - height)
  return { x, y, width, height }
}

export function workAreasFromDisplays(displays: Array<{ workArea: Rectangle }>): DisplayWorkArea[] {
  return displays.map(({ workArea }) => ({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height
  }))
}
