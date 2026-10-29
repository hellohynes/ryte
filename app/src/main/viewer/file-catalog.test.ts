import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { listFileCatalog } from './file-catalog'

let tempDir: string

describe('listFileCatalog', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ryte-file-catalog-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('lists markdown files with metadata and lightweight document titles', async () => {
    mkdirSync(join(tempDir, 'sessions', '2026-06-22', 'shaping'), { recursive: true })
    writeFileSync(
      join(tempDir, 'sessions', '2026-06-22', 'shaping', 'mock-plan.md'),
      '# Body Title\n'
    )
    writeFileSync(join(tempDir, 'sessions', '2026-06-22', 'shaping', 'ignore.txt'), 'ignore')

    const catalog = await listFileCatalog(tempDir)

    expect(catalog.notesRoot).toBe(tempDir)
    expect(catalog.files).toHaveLength(1)
    expect(catalog.files[0]).toMatchObject({
      sourcePath: 'sessions/2026-06-22/shaping/mock-plan.md',
      title: 'Body Title',
      directory: 'sessions/2026-06-22/shaping',
      pathDate: '2026-06-22',
      sizeBytes: '# Body Title\n'.length
    })
    expect(catalog.files[0]?.searchableText).toContain('mock-plan')
    expect(catalog.files[0]?.searchableText).toContain('sessions/2026-06-22/shaping/mock-plan.md')
    expect(typeof catalog.files[0]?.modifiedAt).toBe('string')
    expect(typeof catalog.files[0]?.modifiedAtMs).toBe('number')
    expect(
      typeof catalog.files[0]?.createdAtMs === 'number' || catalog.files[0]?.createdAtMs === null
    ).toBe(true)
  })

  it('returns entries sorted by relative source path', async () => {
    mkdirSync(join(tempDir, 'b'), { recursive: true })
    writeFileSync(join(tempDir, 'b', 'z.md'), '')
    writeFileSync(join(tempDir, 'a.md'), '')

    const catalog = await listFileCatalog(tempDir)

    expect(catalog.files.map((file) => file.sourcePath)).toEqual(['a.md', 'b/z.md'])
  })

  it('uses file names as titles and dates when markdown content has no readable title', async () => {
    mkdirSync(join(tempDir, 'sessions', '2026-06-22'), { recursive: true })
    writeFileSync(join(tempDir, 'sessions', '2026-06-22', 'briefing-2026-06-23.md'), '')

    const catalog = await listFileCatalog(tempDir)

    expect(catalog.files[0]).toMatchObject({
      sourcePath: 'sessions/2026-06-22/briefing-2026-06-23.md',
      title: 'briefing-2026-06-23',
      pathDate: '2026-06-23'
    })
  })
})
