import { describe, expect, it } from 'vitest'

import { parseStructuredAnswer } from './answer-sections'

describe('parseStructuredAnswer', () => {
  it('splits a TL;DR from titled sections', () => {
    const parsed = parseStructuredAnswer(
      [
        '## TL;DR',
        'Jira plans cover two areas; the newest work is on the migration [1].',
        '',
        '## Planning the migration',
        'The plan moves to a one-time sign-in [1].',
        '',
        '## Delivery order',
        'Migration comes first [2].'
      ].join('\n')
    )
    expect(parsed).toEqual({
      tldr: 'Jira plans cover two areas; the newest work is on the migration [1].',
      sections: [
        { title: 'Planning the migration', body: 'The plan moves to a one-time sign-in [1].' },
        { title: 'Delivery order', body: 'Migration comes first [2].' }
      ]
    })
  })

  it('accepts TL;DR spelling and heading-level variants', () => {
    expect(parseStructuredAnswer('# tldr:\nShort.')?.tldr).toBe('Short.')
    expect(parseStructuredAnswer('### TL;DR\nShort.')?.tldr).toBe('Short.')
  })

  it('returns null for answers that are not in the structured shape', () => {
    expect(parseStructuredAnswer('Just a paragraph of prose [1].')).toBeNull()
    expect(parseStructuredAnswer('## Overall direction\nOld style answer.')).toBeNull()
    expect(parseStructuredAnswer('')).toBeNull()
  })

  it('holds back while the TL;DR heading is still streaming in', () => {
    expect(parseStructuredAnswer('##')).toEqual({ tldr: '', sections: [] })
    expect(parseStructuredAnswer('## TL')).toEqual({ tldr: '', sections: [] })
    expect(parseStructuredAnswer('## TL;DR')).toEqual({ tldr: '', sections: [] })
  })

  it('shows a partial TL;DR and a section whose body has not started', () => {
    expect(parseStructuredAnswer('## TL;DR\nJira plans cov')?.tldr).toBe('Jira plans cov')
    expect(parseStructuredAnswer('## TL;DR\nDone.\n\n## Planning\n')).toEqual({
      tldr: 'Done.',
      sections: [{ title: 'Planning', body: '' }]
    })
  })

  it('waits for a section heading to be finished before showing it', () => {
    expect(parseStructuredAnswer('## TL;DR\nDone.\n\n## Planni')).toEqual({
      tldr: 'Done.',
      sections: []
    })
    expect(parseStructuredAnswer('## TL;DR\nDone.\n\n##')?.sections).toEqual([])
  })

  it('keeps a last line that only starts with a hash, such as an issue number', () => {
    expect(parseStructuredAnswer('## TL;DR\nDone.\n\n## Notes\nPrompted by\n#252 shipped')).toEqual(
      {
        tldr: 'Done.',
        sections: [{ title: 'Notes', body: 'Prompted by\n#252 shipped' }]
      }
    )
    expect(parseStructuredAnswer('## TL;DR\n#1234 is done')?.tldr).toBe('#1234 is done')
  })

  it('drops a heading that is immediately followed by another heading', () => {
    const parsed = parseStructuredAnswer('## TL;DR\nDone.\n\n## Stacked\n\n## Real\nBody.')
    expect(parsed?.sections).toEqual([{ title: 'Real', body: 'Body.' }])
  })

  it('does not treat headings inside code fences as sections', () => {
    const parsed = parseStructuredAnswer(
      '## TL;DR\nSee below.\n\n## Config\n```\n## not a heading\n```\nAfter.'
    )
    expect(parsed?.sections).toEqual([
      { title: 'Config', body: '```\n## not a heading\n```\nAfter.' }
    ])
  })

  it('strips emphasis from section titles', () => {
    const parsed = parseStructuredAnswer('## TL;DR\nx\n\n## **Bold** and `code`:\nBody.')
    expect(parsed?.sections[0].title).toBe('Bold and code')
  })
})
