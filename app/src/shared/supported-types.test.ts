import { describe, expect, it } from 'vitest'

import { listedKindOf, supportedKindOf } from './supported-types'

describe('supportedKindOf', () => {
  it('gives code files the code kind in any letter case, and leaves Markdown alone', () => {
    for (const name of ['app.json', 'Run.SH', 'src/view.tsx', 'a/b/theme.CSS', 'ci.yml']) {
      expect(supportedKindOf(name)).toBe('code')
    }
    expect(supportedKindOf('notes.MD')).toBe('note')
  })

  it('gives video files the video kind in any letter case', () => {
    for (const name of ['clip.mp4', 'Demo.MOV', 'a/b/screen.WebM']) {
      expect(supportedKindOf(name)).toBe('video')
    }
    expect(supportedKindOf('clip.mkv')).toBeNull()
  })

  it('gives .html and .htm files the html kind in any letter case, and skips them under a dot folder or node_modules', () => {
    for (const name of ['page.html', 'Report.HTML', 'old/index.htm']) {
      expect(supportedKindOf(name)).toBe('html')
    }
    expect(listedKindOf('review/index.html')).toBe('html')
    expect(listedKindOf('node_modules/pkg/index.html')).toBeNull()
    expect(listedKindOf('.cache/page.HTM')).toBeNull()
  })
})
