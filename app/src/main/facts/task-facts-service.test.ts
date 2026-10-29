import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { TaskFactsService } from './task-facts-service'

let tempDir: string

describe('TaskFactsService', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ryte-task-facts-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('extracts and lists task facts from synthetic markdown files', async () => {
    mkdirSync(join(tempDir, 'sessions', '2026-06-23'), { recursive: true })
    writeFileSync(
      join(tempDir, 'sessions', '2026-06-23', 'briefing.md'),
      '# Briefing\n\n- [ ] Follow up\n- [x] Done\n'
    )
    writeFileSync(join(tempDir, 'sessions', '2026-06-23', 'ignore.txt'), '- [ ] ignore')

    const service = new TaskFactsService()
    const response = await service.list(tempDir, { checked: false })

    expect(response.notesRoot).toBe(tempDir)
    expect(response.tasks).toHaveLength(1)
    expect(response.tasks[0]).toMatchObject({
      sourcePath: 'sessions/2026-06-23/briefing.md',
      checked: false,
      normalizedText: 'Follow up',
      headingPath: ['Briefing']
    })
  })

  it('uses cached task facts until marked stale', async () => {
    const filePath = join(tempDir, 'tasks.md')
    writeFileSync(filePath, '# Tasks\n\n- [ ] First\n')

    const service = new TaskFactsService()
    expect((await service.list(tempDir)).tasks.map((task) => task.normalizedText)).toEqual([
      'First'
    ])

    writeFileSync(filePath, '# Tasks\n\n- [ ] Second\n')
    expect((await service.list(tempDir)).tasks.map((task) => task.normalizedText)).toEqual([
      'First'
    ])

    service.markStale()
    expect((await service.list(tempDir)).tasks.map((task) => task.normalizedText)).toEqual([
      'Second'
    ])
  })

  it('filters checked state and clamps limits', async () => {
    writeFileSync(join(tempDir, 'tasks.md'), '# Tasks\n\n- [ ] One\n- [ ] Two\n- [x] Three\n')

    const service = new TaskFactsService()

    expect((await service.list(tempDir, { checked: false, limit: 1 })).tasks).toHaveLength(1)
    expect(
      (await service.list(tempDir, { checked: true })).tasks.map((task) => task.normalizedText)
    ).toEqual(['Three'])
    expect((await service.list(tempDir, { limit: -1 })).tasks).toHaveLength(0)
  })

  it('toggles a task marker in a synthetic markdown file', async () => {
    const filePath = join(tempDir, 'tasks.md')
    writeFileSync(filePath, '# Tasks\n\n- [ ] Follow up\n')

    const service = new TaskFactsService()
    const result = await service.toggle(tempDir, {
      sourcePath: 'tasks.md',
      line: 3,
      checkboxColumn: 2,
      checked: true,
      expectedLine: '- [ ] Follow up'
    })

    expect(result).toMatchObject({ ok: true })
    expect(readFileSync(filePath, 'utf-8')).toBe('# Tasks\n\n- [x] Follow up\n')
    expect((await service.list(tempDir, { checked: false })).tasks).toHaveLength(0)
  })

  it('rejects toggles when the expected source line changed', async () => {
    const filePath = join(tempDir, 'tasks.md')
    writeFileSync(filePath, '# Tasks\n\n- [ ] Updated task\n')

    const service = new TaskFactsService()
    const result = await service.toggle(tempDir, {
      sourcePath: 'tasks.md',
      line: 3,
      checkboxColumn: 2,
      checked: true,
      expectedLine: '- [ ] Follow up'
    })

    expect(result).toEqual({ ok: false, reason: 'source-line-changed' })
    expect(readFileSync(filePath, 'utf-8')).toBe('# Tasks\n\n- [ ] Updated task\n')
  })
})
