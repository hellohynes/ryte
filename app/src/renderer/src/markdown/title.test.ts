import { describe, expect, it } from 'vitest'

import { extractMarkdownTitle } from './title'

describe('extractMarkdownTitle', () => {
  it('prefers a frontmatter title', () => {
    expect(extractMarkdownTitle('---\ntitle: "Project Brief"\n---\n# Heading')).toBe(
      'Project Brief'
    )
  })

  it('falls back to the first h1 when frontmatter has no title', () => {
    expect(extractMarkdownTitle('---\ntags: [demo]\n---\n\n# Session Notes\n\nBody')).toBe(
      'Session Notes'
    )
  })

  it('falls back to the first readable line when there is no title or h1', () => {
    expect(extractMarkdownTitle('\n\nA useful opening line\n\nMore detail')).toBe(
      'A useful opening line'
    )
  })

  it('strips heading markers from the first readable line fallback', () => {
    expect(extractMarkdownTitle('\n## Secondary Heading\n\nBody')).toBe('Secondary Heading')
  })

  it('returns null for empty markdown', () => {
    expect(extractMarkdownTitle('---\n---\n\n')).toBeNull()
  })
})
