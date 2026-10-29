import { describe, expect, it } from 'vitest'

import { groupTimeline } from './timeline-groups'
import type { TimelineStatus } from '../../../shared/answer-timeline'

const steps = (...statuses: TimelineStatus[]): Array<{ status: TimelineStatus; id: number }> =>
  statuses.map((status, id) => ({ status, id }))

describe('groupTimeline', () => {
  it('gathers consecutive Backlog steps under one node', () => {
    const groups = groupTimeline(steps('done', 'now', 'next', 'next', 'next'))
    expect(groups.map((group) => [group.status, group.items.map((item) => item.id)])).toEqual([
      ['done', [0]],
      ['now', [1]],
      ['next', [2, 3, 4]]
    ])
  })

  it('keeps every Done step as its own node', () => {
    expect(groupTimeline(steps('done', 'done', 'done')).map((group) => group.items.length)).toEqual(
      [1, 1, 1]
    )
  })

  it('does not join Backlog steps that something else separates', () => {
    const groups = groupTimeline(steps('next', 'now', 'next'))
    expect(groups.map((group) => group.first)).toEqual([0, 1, 2])
  })

  it('leaves a group stable as more steps stream in', () => {
    const early = groupTimeline(steps('now', 'next'))
    const later = groupTimeline(steps('now', 'next', 'next'))
    expect(later[1].first).toBe(early[1].first)
    expect(later[1].items.map((item) => item.id)).toEqual([1, 2])
  })
})
