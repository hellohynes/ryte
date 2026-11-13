import { describe, expect, it } from 'vitest'

import { pickToSleep, type ProcessMetric, type SleepEntry } from './sleep-pick'

const MB = 1024 * 1024
// Electron reports a working set in kilobytes.
const metric = (pid: number, mb: number): ProcessMetric => ({
  pid,
  memory: { workingSetSize: mb * 1024 }
})
const entry = (key: string, pid: number, order: number, shown = false): SleepEntry => ({
  key,
  pid,
  order,
  shown
})

describe('pickToSleep', () => {
  const metrics = [metric(10, 400), metric(11, 500), metric(12, 600), metric(13, 300)]

  it('picks nothing while the views fit the budget and the ceiling', () => {
    const entries = [entry('a', 10, 1), entry('b', 11, 2), entry('c', 12, 3, true)]
    expect(pickToSleep(entries, metrics, 2000 * MB, 24)).toEqual([])
  })

  it('puts the view shown longest ago to sleep first, until the rest fit', () => {
    const entries = [
      entry('c', 12, 3),
      entry('a', 10, 1),
      entry('d', 13, 4, true),
      entry('b', 11, 2)
    ]
    // 1800 MB in use against 1000: sleeping a (400) and b (500) leaves 900.
    expect(pickToSleep(entries, metrics, 1000 * MB, 24)).toEqual(['a', 'b'])
  })

  it('counts a process shared by several views once', () => {
    const entries = [entry('a', 10, 1), entry('b', 10, 2), entry('c', 11, 3, true)]
    // 400 + 500 = 900 fits 1000 even though a and b are two views.
    expect(pickToSleep(entries, metrics, 1000 * MB, 24)).toEqual([])
    // Over 800: a goes first but frees nothing while b still shares its process, so b goes too.
    expect(pickToSleep(entries, metrics, 800 * MB, 24)).toEqual(['a', 'b'])
  })

  it('never picks the shown view and keeps at least one view', () => {
    const entries = [entry('a', 10, 1, true), entry('b', 11, 2), entry('c', 12, 3)]
    expect(pickToSleep(entries, metrics, 1 * MB, 24)).toEqual(['b', 'c'])
    expect(pickToSleep([entry('a', 10, 1)], metrics, 1 * MB, 24)).toEqual([])
    expect(pickToSleep([entry('a', 10, 1), entry('b', 11, 2)], metrics, 1 * MB, 24)).toEqual(['a'])
  })

  it('applies the ceiling even when memory is low', () => {
    const entries = Array.from({ length: 6 }, (_, i) => entry(`v${i}`, 20 + i, i + 1, i === 5))
    const light = entries.map((e) => metric(e.pid, 10))
    expect(pickToSleep(entries, light, 1536 * MB, 4)).toEqual(['v0', 'v1'])
  })

  it('treats a view with no process yet as free and not shared', () => {
    const entries = [entry('a', 0, 1), entry('b', 0, 2), entry('c', 11, 3, true)]
    expect(pickToSleep(entries, metrics, 600 * MB, 24)).toEqual([])
  })
})
