import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSearchStore } from '../stores/search'
import { useSearchPresentation } from './useSearchPresentation'

const ANSWER = [
  '## TL;DR',
  'Short overview of the notes [3].',
  '',
  '## Sharing flags',
  'The spec explains how flags are shared [3]. The overview builds on it [1].',
  '',
  '## Review prep',
  'A review flagged the wording [4].'
].join('\n')

/** Runs animation frames by hand so the sequence can be stepped through in fixed increments. */
function frameClock(): { advance: (ms: number) => void } {
  let now = 0
  let callback: FrameRequestCallback | null = null
  vi.stubGlobal('performance', { now: () => now })
  vi.stubGlobal('window', {
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      callback = cb
      return 1
    },
    cancelAnimationFrame: () => {
      callback = null
    },
    matchMedia: () => ({ matches: false })
  })
  return {
    advance(ms: number) {
      const end = now + ms
      while (now < end) {
        now += 16
        const run = callback
        callback = null
        run?.(now)
      }
    }
  }
}

describe('useSearchPresentation', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.unstubAllGlobals())

  async function start(): Promise<{
    search: ReturnType<typeof useSearchStore>
    presentation: ReturnType<typeof useSearchPresentation>
    clock: ReturnType<typeof frameClock>
  }> {
    const clock = frameClock()
    const search = useSearchStore()
    const presentation = effectScope().run(() =>
      useSearchPresentation(search, ref({ 'plans/spec.md': 'Beacon flag spec' }))
    ) as ReturnType<typeof useSearchPresentation>

    search.query = 'flags'
    search.status = 'searching'
    search.stage = 'writing-summary'
    search.sources = [
      {
        index: 1,
        sourcePath: 'plans/spec.md',
        headingPath: [],
        preview: '',
        matchCount: 1,
        retrievalMode: 'keyword'
      }
    ]
    await nextTick()
    clock.advance(4_000)
    return { search, presentation, clock }
  }

  it('keeps the box working and updates its last line while the summary is written', async () => {
    const { search, presentation, clock } = await start()
    search.status = 'streaming'
    search.citations = [
      { index: 3, sourcePath: 'plans/spec.md', headingPath: [] },
      { index: 1, sourcePath: 'plans/other.md', headingPath: [] },
      { index: 4, sourcePath: 'plans/review.md', headingPath: [] }
    ]
    search.answer = ANSWER
    await nextTick()

    const seen: string[] = []
    for (let step = 0; step < 400 && presentation.phase.value !== 'settled'; step += 1) {
      clock.advance(100)
      search.status = step > 20 ? 'done' : 'streaming'
      await nextTick()
      const last = presentation.traceLines.value.at(-1)?.text ?? ''
      if (seen.at(-1) !== last) seen.push(last)
      expect(presentation.working.value || (presentation.phase.value as string) === 'settled').toBe(
        true
      )
    }

    expect(seen).toContain('Writing the short overview')
    expect(seen.some((line) => line.startsWith('Writing about “Sharing flags”'))).toBe(true)
    // Sections write at once, so the last line follows the newest section and names its source.
    expect(
      seen.some((line) => /^Writing about “Review prep”, drawing on “review”$/.test(line))
    ).toBe(true)
    expect(presentation.phase.value as string).toBe('settled')
    expect(presentation.thoughtLabel.value).toMatch(/^Thought for \d+s$/)
    expect(presentation.resultsOpenByDefault.value).toBe(false)
  })

  it('shows the results at once, and open, when a search ends with no summary', async () => {
    const clock = frameClock()
    const search = useSearchStore()
    const presentation = effectScope().run(() =>
      useSearchPresentation(search, ref({}))
    ) as ReturnType<typeof useSearchPresentation>

    search.query = 'flags'
    search.status = 'searching'
    search.stage = 'gathering-evidence'
    search.sources = [
      {
        index: 1,
        sourcePath: 'plans/spec.md',
        headingPath: [],
        preview: '',
        matchCount: 1,
        retrievalMode: 'keyword'
      }
    ]
    await nextTick()
    clock.advance(100)

    search.status = 'done'
    await nextTick()
    clock.advance(32)

    expect(presentation.phase.value).toBe('settled')
    expect(presentation.resultsOpenByDefault.value).toBe(true)
    expect(presentation.working.value).toBe(false)
    expect(presentation.traceLines.value.map((line) => line.state)).toEqual(
      presentation.traceLines.value.map(() => 'done')
    )
  })

  it('holds the text back until the thinking lines have played, even if the provider is done', async () => {
    const clock = frameClock()
    const search = useSearchStore()
    const presentation = effectScope().run(() =>
      useSearchPresentation(search, ref({}))
    ) as ReturnType<typeof useSearchPresentation>

    search.query = 'flags'
    search.status = 'searching'
    search.stage = 'writing-summary'
    await nextTick()
    clock.advance(100)

    search.answer = ANSWER
    search.status = 'done'
    await nextTick()
    clock.advance(100)

    expect(presentation.phase.value).toBe('thinking')
    expect(presentation.displayedAnswer.value).toBe('')
  })

  it('brings every title in after the overview and writes the sections at the same time', async () => {
    const { search, presentation, clock } = await start()
    const body = 'Plain words about this area and where it stands now. '.repeat(5).trim()
    search.status = 'streaming'
    search.citations = []
    search.answer = [
      '## TL;DR',
      'Overview.',
      '',
      ...['One', 'Two', 'Three'].flatMap((title) => [`## Area ${title}`, body, ''])
    ].join('\n')
    await nextTick()

    const titleAt: Record<string, number> = {}
    let sawOverlap = false
    let finishedAt = -1
    for (let time = 0; time < 60_000 && finishedAt < 0; time += 16) {
      clock.advance(16)
      search.status = time > 1_000 ? 'done' : 'streaming'
      await nextTick()
      const text = presentation.displayedAnswer.value
      for (const title of ['One', 'Two', 'Three']) {
        if (!(title in titleAt) && text.includes(`## Area ${title}\n`)) titleAt[title] = time
      }
      const flags = presentation.writing.value.sections
      if (flags.filter(Boolean).length >= 2) sawOverlap = true
      if ((presentation.phase.value as string) === 'settled') finishedAt = time
    }

    expect(Object.keys(titleAt)).toEqual(['One', 'Two', 'Three'])
    expect(titleAt.Two - titleAt.One).toBeGreaterThanOrEqual(1_300)
    expect(titleAt.Three - titleAt.Two).toBeGreaterThanOrEqual(1_300)
    expect(sawOverlap).toBe(true)
    expect(finishedAt).toBeGreaterThan(0)
  })
})
