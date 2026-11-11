import { describe, expect, it } from 'vitest'

import { renderDocument } from '../markdown/renderer'
import { currentSectionId, sectionOutlineOf } from './document-outline-model'

const NOTE = '# Title\n\nIntro.\n\n## TL;DR\n\nx\n\n### Detail\n\n## Next\n\ny\n'

describe('document outline', () => {
  it('starts at the first section heading, with no Overview entry or page title', async () => {
    const { outline } = await renderDocument(NOTE, {})
    const sections = sectionOutlineOf(outline)
    expect(sections.map((item) => item.text)).toEqual(['TL;DR', 'Detail', 'Next'])
    expect(sections.some((item) => item.id === 'overview')).toBe(false)
  })

  it('marks the first section before any heading has been reached', async () => {
    const { outline } = await renderDocument(NOTE, {})
    const sections = sectionOutlineOf(outline)
    const tops: Record<string, number> = { [sections[0]!.id]: 120, [sections[2]!.id]: 600 }
    expect(currentSectionId(sections, (id) => tops[id] ?? null, 0)).toBe(sections[0]!.id)
    expect(currentSectionId(sections, (id) => tops[id] ?? null, 700)).toBe(sections[2]!.id)
  })
})
