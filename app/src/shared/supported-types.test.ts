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

  it('gives video files the video kind in any letter case', () => {
    for (const name of ['clip.mp4', 'Demo.MOV', 'a/b/screen.WebM']) {
      expect(supportedKindOf(name)).toBe('video')
    }
    expect(supportedKindOf('clip.mkv')).toBeNull()
  })
})
