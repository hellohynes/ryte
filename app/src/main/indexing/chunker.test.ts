import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { chunkFile, chunkMarkdown } from './chunker'

let tempDir: string

describe('chunker', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ryte-chunker-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('chunkMarkdown — heading-aware split', () => {
    it('splits a 2-heading doc into 2 chunks with breadcrumb paths', () => {
      const body = '# A\n\nbody A\n\n## B\n\nbody B\n'
      const chunks = chunkMarkdown(body, 'doc.md', {})
      expect(chunks).toHaveLength(2)
      expect(chunks[0].headingPath).toEqual(['A'])
      expect(chunks[1].headingPath).toEqual(['A', 'B'])
      expect(chunks[0].text).toContain('A')
      expect(chunks[0].text).toContain('body A')
      expect(chunks[1].text).toContain('A > B')
      expect(chunks[1].text).toContain('body B')
    })

    it('pops the stack correctly when level rises again', () => {
      const body = '# A\n\nbody A\n\n## B\n\nbody B\n\n# C\n\nbody C\n'
      const chunks = chunkMarkdown(body, 'doc.md', {})
      expect(chunks).toHaveLength(3)
      expect(chunks[0].headingPath).toEqual(['A'])
      expect(chunks[1].headingPath).toEqual(['A', 'B'])
      expect(chunks[2].headingPath).toEqual(['C'])
    })

    it('returns a single chunk with empty heading path when there are no headings', () => {
      const body = 'no headings just text\n\nparagraph two\n'
      const chunks = chunkMarkdown(body, 'doc.md', {})
      expect(chunks).toHaveLength(1)
      expect(chunks[0].headingPath).toEqual([])
      expect(chunks[0].text).toContain('no headings')
    })

    it('returns empty array for empty body', () => {
      expect(chunkMarkdown('', 'doc.md', {})).toEqual([])
      expect(chunkMarkdown('   \n  \n', 'doc.md', {})).toEqual([])
    })
  })

  describe('chunkMarkdown — large body splits', () => {
    it('splits a single >4000-char body under one heading into multiple chunks each ≤4000 chars', () => {
      const longParagraph = 'word '.repeat(1200) // ~6000 chars
      const body = `# Big\n\n${longParagraph}\n`
      const chunks = chunkMarkdown(body, 'doc.md', {})
      expect(chunks.length).toBeGreaterThanOrEqual(2)
      for (const c of chunks) {
        expect(c.text.length).toBeLessThanOrEqual(4000)
        expect(c.headingPath).toEqual(['Big'])
      }
    })

    it('prefers paragraph boundaries when splitting large bodies', () => {
      const paragraphs = Array.from({ length: 20 }, (_, i) => `paragraph ${i} ${'x'.repeat(200)}`)
      const body = `# H\n\n${paragraphs.join('\n\n')}\n`
      const chunks = chunkMarkdown(body, 'doc.md', {})
      expect(chunks.length).toBeGreaterThanOrEqual(2)
      for (const c of chunks) {
        expect(c.text.length).toBeLessThanOrEqual(4000)
      }
    })
  })

  describe('chunkFile — frontmatter and date extraction', () => {
    it('parses frontmatter and strips it from the body', () => {
      const filePath = join(tempDir, 'with-fm.md')
      writeFileSync(filePath, '---\nfoo: bar\nbaz: 42\n---\n# Heading\n\nbody text\n')
      const chunks = chunkFile(filePath, tempDir)
      expect(chunks).toHaveLength(1)
      expect(chunks[0].frontmatter).toEqual({ foo: 'bar', baz: 42 })
      expect(chunks[0].text).not.toContain('foo: bar')
      expect(chunks[0].text).toContain('body text')
    })

    it('extracts YYYY-MM-DD date from path', () => {
      const subdir = join(tempDir, 'sessions', '2026-05-12')
      mkdirSync(subdir, { recursive: true })
      const filePath = join(subdir, 'briefing.md')
      writeFileSync(filePath, '# Today\n\nstuff\n')
      const chunks = chunkFile(filePath, tempDir)
      expect(chunks).toHaveLength(1)
      expect(chunks[0].date).toBe('2026-05-12')
      expect(chunks[0].sourcePath).toBe('sessions/2026-05-12/briefing.md')
    })

    it('returns null date for paths without a YYYY-MM-DD segment', () => {
      const filePath = join(tempDir, 'action-items.md')
      writeFileSync(filePath, '# Items\n\nstuff\n')
      const chunks = chunkFile(filePath, tempDir)
      expect(chunks[0].date).toBeNull()
    })
  })
})
