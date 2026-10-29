import type { TimelineStatus } from '../../../shared/answer-timeline'

export interface TimelineGroup<T> {
  status: TimelineStatus
  /** Position of the group's first step in the whole timeline; stable while steps stream in. */
  first: number
  items: T[]
}

/**
 * Steps in the order they were written, with consecutive Backlog steps gathered under one node:
 * the Backlog is a list of what is waiting, not a sequence of events. Done and In Progress steps
 * keep a node each. Gathering never changes how the first Backlog step reads, so a second one
 * arriving only adds below it.
 */
export function groupTimeline<T extends { status: TimelineStatus }>(
  steps: readonly T[]
): TimelineGroup<T>[] {
  const groups: TimelineGroup<T>[] = []
  steps.forEach((step, index) => {
    const last = groups.at(-1)
    if (step.status === 'next' && last?.status === 'next') last.items.push(step)
    else groups.push({ status: step.status, first: index, items: [step] })
  })
  return groups
}
