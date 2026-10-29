import { describe, expect, it } from 'vitest'

import { isTimelineTitle, parseTimelineItems } from './answer-timeline'

describe('parseTimelineItems', () => {
  it('reads Done, Now and Next lines in order, with optional dates', () => {
    const body = [
      '- Done (Oct 9): Wrote the threads and events breadboard [2]',
      '- Done: Chose the callout API shape [3]',
      '- Now (Oct 12): Building the proof prototype [1]',
      '- Next: Review the prototype with design'
    ].join('\n')
    expect(parseTimelineItems(body)).toEqual([
      {
        status: 'done',
        date: 'Oct 9',
        refs: [],
        text: 'Wrote the threads and events breadboard [2]'
      },
      { status: 'done', date: null, refs: [], text: 'Chose the callout API shape [3]' },
      { status: 'now', date: 'Oct 12', refs: [], text: 'Building the proof prototype [1]' },
      { status: 'next', date: null, refs: [], text: 'Review the prototype with design' }
    ])
  })

  it('accepts bold labels, other bullet marks and any letter case', () => {
    expect(
      parseTimelineItems('* **Done**: One\n- **now (Oct 1)**: Two\n- NEXT: Three').map(
        (item) => item.status
      )
    ).toEqual(['done', 'now', 'next'])
    expect(parseTimelineItems('- **Now (Oct 1)**: Two')[0]).toMatchObject({
      status: 'now',
      date: 'Oct 1',
      text: 'Two'
    })
  })

  it('ignores lines that are not timeline steps', () => {
    expect(parseTimelineItems('Some prose.\n- Later: not a known label\n- Done: Real one')).toEqual(
      [{ status: 'done', date: null, refs: [], text: 'Real one' }]
    )
  })

  it('shows a step only once it has text, so half-typed lines never flash', () => {
    expect(parseTimelineItems('- Do')).toEqual([])
    expect(parseTimelineItems('- Done (Oc')).toEqual([])
    expect(parseTimelineItems('- Done:')).toEqual([])
    expect(parseTimelineItems('- Done: Wr')).toEqual([
      { status: 'done', date: null, refs: [], text: 'Wr' }
    ])
  })

  it('returns nothing for an empty body', () => {
    expect(parseTimelineItems('')).toEqual([])
  })
})

describe('ticket and PR references', () => {
  it('reads PR numbers and ticket keys from the brackets, apart from the date', () => {
    const [item] = parseTimelineItems(
      '- Done (October 9, PR #123, DDT-1234): Wrote the breadboard [2]'
    )
    expect(item).toEqual({
      status: 'done',
      date: 'October 9',
      refs: ['PR #123', 'DDT-1234'],
      text: 'Wrote the breadboard [2]'
    })
  })

  it('takes references in any order, with or without a date', () => {
    expect(parseTimelineItems('- Now (DDT-1238): Building it')[0]).toMatchObject({
      date: null,
      refs: ['DDT-1238']
    })
    expect(parseTimelineItems('- Next (DDT-1242, PR 7, Oct 20): Review')[0]).toMatchObject({
      date: 'Oct 20',
      refs: ['DDT-1242', 'PR 7']
    })
  })

  it('reads full web addresses as references, even when the brackets run long', () => {
    const pr = 'https://github.com/hellohynes/ryte/pull/23'
    const ticket = 'https://dialpad.atlassian.net/browse/DDT-1234'
    expect(
      parseTimelineItems(`- Done (October 9, ${pr}, ${ticket}): Shipped it [1]`)[0]
    ).toMatchObject({
      date: 'October 9',
      refs: [pr, ticket]
    })
  })

  it('keeps a step whose brackets hold several long addresses', () => {
    const urls = Array.from(
      { length: 4 },
      (_, i) => `https://github.com/some-organisation/a-repository-name/pull/${1000 + i}`
    )
    const line = `- Done (October 9, ${urls.join(', ')}): Shipped it [1]`
    expect(line.indexOf('):')).toBeGreaterThan(240)
    expect(parseTimelineItems(line)[0]).toMatchObject({ date: 'October 9', refs: urls })
  })

  it('does not turn a bold label that is not a list item into a step', () => {
    for (const line of [
      '**Done**: shipped it',
      '**Now**: reading',
      '-**Done**: x',
      '* * * Done: x',
      '- Done (): x'
    ]) {
      expect(parseTimelineItems(line), line).toEqual([])
    }
    for (const line of [
      '- **Done**: x',
      '* Done: x',
      '-   Done: x',
      '- ** Now **: x',
      '-\u00a0Done: x',
      '-\u00a0**Done**: x'
    ]) {
      expect(parseTimelineItems(line), line).toHaveLength(1)
    }
  })

  it('reads a long run of spaces in linear time, so a hostile reply cannot stall the page', () => {
    const started = performance.now()
    parseTimelineItems(`- Done${' '.repeat(20000)}`)
    parseTimelineItems(`- Done (${' '.repeat(20000)}`)
    parseTimelineItems(`-${' '.repeat(20000)}Done: x${' '.repeat(20000)}`)
    expect(performance.now() - started).toBeLessThan(200)
  })

  it('does not mistake an ordinary word in the brackets for a reference', () => {
    expect(parseTimelineItems('- Done (last week): Shipped')[0]).toMatchObject({
      date: 'last week',
      refs: []
    })
  })

  it('shows a step only once its brackets are closed', () => {
    expect(parseTimelineItems('- Done (October 9, PR #12')).toEqual([])
  })
})

describe('isTimelineTitle', () => {
  it('matches the Timeline section by title', () => {
    expect(isTimelineTitle('Timeline')).toBe(true)
    expect(isTimelineTitle(' timeline ')).toBe(true)
    expect(isTimelineTitle('Timeline of the migration')).toBe(false)
    expect(isTimelineTitle('Delivery order')).toBe(false)
  })
})
