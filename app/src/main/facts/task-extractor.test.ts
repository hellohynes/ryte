import { describe, expect, it } from 'vitest'

import { extractMarkdownTaskFacts, toggleMarkdownTask } from './task-extractor'
import type { MarkdownTaskFact } from '../../shared/tasks'

const extractedAt = '2026-06-23T20:00:00.000Z'

function extract(
  markdown: string,
  sourcePath = 'sessions/2026-06-23/briefing.md'
): MarkdownTaskFact[] {
  return extractMarkdownTaskFacts({ markdown, sourcePath, sourceMtimeMs: 1234, extractedAt })
}

describe('extractMarkdownTaskFacts', () => {
  it('extracts checked state, line, checkbox offset, heading context, and normalized text', () => {
    const tasks = extract(`# Briefing\n\n- [ ] Follow up with design\n- [x] Send recap\n`)

    expect(tasks).toHaveLength(2)
    expect(tasks[0]).toMatchObject({
      sourcePath: 'sessions/2026-06-23/briefing.md',
      line: 3,
      checkboxColumn: 2,
      checked: false,
      normalizedText: 'Follow up with design',
      headingPath: ['Briefing'],
      occurrenceIndex: 0,
      sourceMtimeMs: 1234,
      extractedAt
    })
    expect(tasks[1]).toMatchObject({
      line: 4,
      checked: true,
      normalizedText: 'Send recap',
      headingPath: ['Briefing']
    })
    expect(tasks[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it('keeps source line numbers correct after YAML frontmatter', () => {
    const tasks = extract('---\ntitle: Morning\n---\n# Today\n\n- [ ] Review notes\n')

    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      line: 6,
      checkboxColumn: 2,
      normalizedText: 'Review notes',
      headingPath: ['Today']
    })
  })

  it('tracks nested heading context and indented task markers', () => {
    const tasks = extract(
      [
        '# Session',
        '## Meetings',
        '- [ ] Top level',
        '  - [x] Nested task',
        '### Follow-up',
        '1. [ ] Numbered task'
      ].join('\n')
    )

    expect(tasks.map((task) => task.headingPath)).toEqual([
      ['Session', 'Meetings'],
      ['Session', 'Meetings'],
      ['Session', 'Meetings', 'Follow-up']
    ])
    expect(tasks.map((task) => task.checkboxColumn)).toEqual([2, 4, 3])
  })

  it('ignores non-task bullets and checkbox text inside fenced code', () => {
    const tasks = extract(
      [
        '# Meeting',
        '- normal bullet',
        '`- [ ] inline code only`',
        '```',
        '- [ ] code block task-shaped text',
        '```',
        '- [ ] Real task'
      ].join('\n')
    )

    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.normalizedText).toBe('Real task')
  })

  it('distinguishes duplicate task text while keeping moved-line identity stable', () => {
    const first = extract('# Plan\n\n- [ ] Same task\n- [ ] Same task\n')
    const moved = extract('# Plan\n\nIntro paragraph\n\n- [ ] Same task\n- [ ] Same task\n')

    expect(first).toHaveLength(2)
    expect(first[0]?.fingerprint).not.toBe(first[1]?.fingerprint)
    expect(moved[0]?.fingerprint).toBe(first[0]?.fingerprint)
    expect(moved[1]?.fingerprint).toBe(first[1]?.fingerprint)
  })

  it('handles CRLF line endings and preserves deterministic offsets', () => {
    const tasks = extract('# Windows\r\n\r\n- [ ] CRLF task\r\n')

    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      line: 3,
      checkboxColumn: 2,
      normalizedText: 'CRLF task'
    })
  })
})

describe('toggleMarkdownTask', () => {
  it('toggles only the checkbox marker and preserves the rest of the source text', () => {
    const markdown = '# Briefing\n\n- [ ] Follow up with design\n'
    const [task] = extract(markdown)

    const result = toggleMarkdownTask({ markdown, task: task!, checked: true, extractedAt })

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.markdown).toBe('# Briefing\n\n- [x] Follow up with design\n')
    expect(result.task.checked).toBe(true)
    expect(result.task.fingerprint).toBe(task?.fingerprint)
  })

  it('preserves CRLF endings when toggling', () => {
    const markdown = '# Briefing\r\n\r\n- [x] Done item\r\n'
    const [task] = extract(markdown)

    const result = toggleMarkdownTask({ markdown, task: task!, checked: false, extractedAt })

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.markdown).toBe('# Briefing\r\n\r\n- [ ] Done item\r\n')
  })

  it('rejects stale facts when the target line is missing', () => {
    const [task] = extract('# Briefing\n\n- [ ] Follow up\n')

    const result = toggleMarkdownTask({ markdown: '# Briefing\n', task: task!, extractedAt })

    expect(result).toEqual({ ok: false, reason: 'line-missing' })
  })

  it('rejects stale facts when the checkbox marker moved', () => {
    const [task] = extract('# Briefing\n\n- [ ] Follow up\n')

    const result = toggleMarkdownTask({
      markdown: '# Briefing\n\n  - [ ] Follow up\n',
      task: task!,
      extractedAt
    })

    expect(result).toEqual({ ok: false, reason: 'checkbox-missing' })
  })

  it('rejects stale facts when the task text changed', () => {
    const [task] = extract('# Briefing\n\n- [ ] Follow up\n')

    const result = toggleMarkdownTask({
      markdown: '# Briefing\n\n- [ ] Follow up tomorrow\n',
      task: task!,
      extractedAt
    })

    expect(result).toEqual({ ok: false, reason: 'task-text-changed' })
  })

  it('rejects stale facts when duplicate occurrence identity no longer matches', () => {
    const tasks = extract('# Plan\n\n- [ ] Same task\n- [ ] Same task\n')

    const result = toggleMarkdownTask({
      markdown: '# Plan\n\n- [ ] Same task\n',
      task: tasks[1]!,
      extractedAt
    })

    expect(result).toEqual({ ok: false, reason: 'line-missing' })
  })
})
