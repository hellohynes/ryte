import { describe, expect, it } from 'vitest'

import { supportedKindOf } from './supported-types'

describe('supportedKindOf', () => {
  it('gives code files the code kind in any letter case, and leaves HTML and Markdown alone', () => {
    for (const name of ['app.json', 'Run.SH', 'src/view.tsx', 'a/b/theme.CSS', 'ci.yml']) {
      expect(supportedKindOf(name)).toBe('code')
    }
    expect(supportedKindOf('page.html')).toBeNull()
    expect(supportedKindOf('notes.MD')).toBe('note')
  })
})
