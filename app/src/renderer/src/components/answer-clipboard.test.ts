import { describe, expect, it } from 'vitest'

import { buildAnswerClipboard } from './answer-clipboard'
import type { CitedSource } from './cited-sources'

const sources: CitedSource[] = [
  { number: 1, sourcePath: 'plans/jira-mcp.md', headingPaths: [['Plan', 'Risks']] },
  { number: 2, sourcePath: 'plans/spine.md', headingPaths: [[]] }
]

describe('answer clipboard', () => {
  it('keeps the answer Markdown and its inline citations, then lists each document once', () => {
    const { markdown } = buildAnswerClipboard('## TL;DR\n\nSkip Jira [1][2].', sources, '')
    expect(markdown).toBe(
      [
        '## TL;DR',
        '',
        'Skip Jira [1][2].',
        '',
        '## Sources',
        '',
        '1. [1] plans/jira-mcp.md',
        '2. [2] plans/spine.md'
      ].join('\n')
    )
  })

  it('produces superscript markers and an ordered source list for rich paste', () => {
    const { html } = buildAnswerClipboard('Skip Jira [1].', sources, '<p>Skip Jira [1].</p>')
    expect(html).toContain('<p>Skip Jira <sup>1</sup>.</p>')
    expect(html).toContain('<h2>Sources</h2>')
    expect(html).toContain('<li value="1">plans/jira-mcp.md</li>')
  })

  it('escapes file names in the HTML source list', () => {
    const { html } = buildAnswerClipboard(
      'x [1]',
      [{ number: 1, sourcePath: 'a<b>.md', headingPaths: [] }],
      '<p>x [1]</p>'
    )
    expect(html).toContain('a&lt;b&gt;.md')
  })

  it('returns the bare answer when nothing is cited', () => {
    const result = buildAnswerClipboard('Plain answer.', [], '<p>Plain answer.</p>')
    expect(result.markdown).toBe('Plain answer.')
    expect(result.html).toBe('<p>Plain answer.</p>')
  })
})
