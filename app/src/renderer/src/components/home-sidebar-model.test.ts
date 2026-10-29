import { describe, expect, it } from 'vitest'

import type { FileCatalogEntry } from '../../../shared/files'
import type { MarkdownTaskFact } from '../../../shared/tasks'
import { buildHomeSidebarModel, homeSmartGroupItemTitle } from './home-sidebar-model'

function catalogEntry(overrides: Partial<FileCatalogEntry>): FileCatalogEntry {
  return {
    sourcePath: 'plans/a.md',
    title: 'a',
    directory: 'plans',
    searchableText: 'a plans/a.md',
    pathDate: null,
    modifiedAt: '2026-05-26T12:00:00.000Z',
    modifiedAtMs: 100,
    createdAt: '2026-05-26T12:00:00.000Z',
    createdAtMs: 100,
    sizeBytes: 1,
    ...overrides
  }
}

function taskFact(overrides: Partial<MarkdownTaskFact>): MarkdownTaskFact {
  return {
    id: 'task-1',
    sourcePath: 'sessions/2026-06-23/briefing.md',
    line: 3,
    checkboxColumn: 2,
    checked: false,
    rawLine: '- [ ] Follow up',
    normalizedText: 'Follow up',
    headingPath: ['Briefing'],
    occurrenceIndex: 0,
    fingerprint: 'task-1',
    sourceMtimeMs: 100,
    extractedAt: '2026-06-23T20:00:00.000Z',
    ...overrides
  }
}

describe('buildHomeSidebarModel', () => {
  it('builds briefing, plans, and recent groups without duplicating smart group items into recent', () => {
    const model = buildHomeSidebarModel({
      activeTabId: 'tab-b',
      catalogFiles: [
        catalogEntry({
          sourcePath: 'sessions/2026-05-26/daily-briefing.md',
          title: 'daily-briefing',
          directory: 'sessions/2026-05-26',
          searchableText: 'daily-briefing sessions/2026-05-26/daily-briefing.md',
          createdAtMs: 500,
          modifiedAtMs: 500
        }),
        catalogEntry({
          sourcePath: 'sessions/2026-05-25/daily-briefing.md',
          title: 'daily-briefing',
          directory: 'sessions/2026-05-25',
          searchableText: 'daily-briefing sessions/2026-05-25/daily-briefing.md',
          createdAtMs: 300,
          modifiedAtMs: 300
        }),
        catalogEntry({
          sourcePath: 'plans/latest-plan.md',
          title: 'Latest Plan Title',
          searchableText: 'latest plan title plans/latest-plan.md',
          modifiedAtMs: 400
        }),
        catalogEntry({
          sourcePath: 'sessions/2026-05-25/shaping/widget-shaping.md',
          title: 'widget-shaping',
          directory: 'sessions/2026-05-25/shaping',
          searchableText: 'widget-shaping sessions/2026-05-25/shaping/widget-shaping.md',
          modifiedAtMs: 300
        })
      ],
      recents: [
        {
          sourcePath: 'plans/latest-plan.md',
          title: 'latest-plan.md',
          openedAt: '2026-05-26T12:00:00.000Z'
        },
        {
          sourcePath: 'sessions/2026-05-26/daily-briefing.md',
          title: 'daily-briefing.md',
          openedAt: '2026-05-26T11:00:00.000Z'
        },
        {
          sourcePath: 'reviews/pr-678-review.md',
          title: 'pr-678-review.md',
          openedAt: '2026-05-26T10:00:00.000Z'
        }
      ],
      tabs: [
        {
          id: 'tab-a',
          sourcePath: 'plans/latest-plan.md',
          title: 'latest-plan.md',
          viewMode: 'preview'
        },
        {
          id: 'tab-b',
          sourcePath: 'sessions/2026-05-26/daily-briefing.md',
          title: 'daily-briefing.md',
          viewMode: 'source'
        }
      ]
    })

    expect(model.groups.map((group) => group.id)).toEqual(['tasks', 'briefing', 'plans', 'recent'])
    expect(model.groups.find((group) => group.id === 'briefing')).toMatchObject({
      id: 'briefing',
      title: 'Briefing',
      headingId: 'home-briefing-heading',
      emptyLabel: 'No briefings',
      items: [
        {
          id: 'briefing:sessions/2026-05-26/daily-briefing.md',
          sourcePath: 'sessions/2026-05-26/daily-briefing.md',
          active: true,
          ariaLabel: 'Open sessions/2026-05-26/daily-briefing.md'
        },
        {
          id: 'briefing:sessions/2026-05-25/daily-briefing.md',
          sourcePath: 'sessions/2026-05-25/daily-briefing.md',
          active: false,
          ariaLabel: 'Open sessions/2026-05-25/daily-briefing.md'
        }
      ]
    })
    expect(
      model.groups.find((group) => group.id === 'plans')?.items.map((item) => item.sourcePath)
    ).toEqual(['plans/latest-plan.md', 'sessions/2026-05-25/shaping/widget-shaping.md'])
    expect(
      model.groups.find((group) => group.id === 'recent')?.items.map((item) => item.sourcePath)
    ).toEqual(['reviews/pr-678-review.md'])
    expect(model.groups.find((group) => group.id === 'recent')?.items[0]?.title).toBe(
      'pr-678-review.md'
    )
  })

  it('builds a read-only task group without deduping file smart groups', () => {
    const model = buildHomeSidebarModel({
      activeTabId: 'tab-a',
      catalogFiles: [
        catalogEntry({
          sourcePath: 'plans/task-plan.md',
          title: 'Task Plan',
          searchableText: 'task plan plans/task-plan.md'
        })
      ],
      recents: [
        {
          sourcePath: 'plans/task-plan.md',
          title: 'task-plan.md',
          openedAt: '2026-05-26T12:00:00.000Z'
        }
      ],
      tabs: [
        {
          id: 'tab-a',
          sourcePath: 'plans/task-plan.md',
          title: 'task-plan.md',
          viewMode: 'preview'
        }
      ],
      activeTaskFingerprint: 'task-plan-1',
      taskFacts: [
        taskFact({
          sourcePath: 'plans/task-plan.md',
          normalizedText: 'Review task aggregation',
          headingPath: ['Plan', 'Next Steps'],
          fingerprint: 'task-plan-1'
        }),
        taskFact({
          sourcePath: 'plans/done.md',
          normalizedText: 'Completed task',
          checked: true,
          fingerprint: 'done-1'
        })
      ]
    })

    const tasks = model.groups.find((group) => group.id === 'tasks')
    expect(tasks).toMatchObject({
      title: 'Tasks',
      emptyLabel: 'No open tasks',
      items: [
        {
          id: 'tasks:task-plan-1',
          sourcePath: 'plans/task-plan.md',
          title: 'Review task aggregation',
          detail: 'plans/task-plan.md \u203a Plan \u203a Next Steps',
          active: true,
          ariaLabel: 'Open task Review task aggregation in plans/task-plan.md'
        }
      ]
    })
    expect(
      model.groups.find((group) => group.id === 'plans')?.items.map((item) => item.sourcePath)
    ).toEqual(['plans/task-plan.md'])
    expect(model.groups.find((group) => group.id === 'recent')?.items).toEqual([])
  })

  it('excludes external workspace recents from notes-backed home groups', () => {
    const model = buildHomeSidebarModel({
      activeTabId: 'external-tab',
      catalogFiles: [
        catalogEntry({
          sourcePath: 'docs/overview.md',
          title: 'Overview',
          searchableText: 'overview docs/overview.md'
        })
      ],
      recents: [
        {
          externalPath: '/Users/hynes/Desktop/outside.md',
          title: 'outside.md',
          openedAt: '2026-05-26T13:00:00.000Z'
        },
        {
          sourcePath: 'docs/overview.md',
          title: 'overview.md',
          openedAt: '2026-05-26T12:00:00.000Z'
        }
      ],
      tabs: [
        {
          id: 'external-tab',
          externalPath: '/Users/hynes/Desktop/outside.md',
          title: 'outside.md',
          viewMode: 'preview'
        }
      ]
    })

    expect(
      model.groups.find((group) => group.id === 'recent')?.items.map((item) => item.sourcePath)
    ).toEqual(['docs/overview.md'])
  })

  it('selects one task row by fingerprint instead of highlighting every task from the active file', () => {
    const model = buildHomeSidebarModel({
      activeTabId: 'tab-a',
      catalogFiles: [],
      recents: [],
      tabs: [
        {
          id: 'tab-a',
          sourcePath: 'action-items.md',
          title: 'action-items.md',
          viewMode: 'preview'
        }
      ],
      activeTaskFingerprint: 'task-2',
      taskFacts: [
        taskFact({
          sourcePath: 'action-items.md',
          normalizedText: 'First task',
          fingerprint: 'task-1'
        }),
        taskFact({
          sourcePath: 'action-items.md',
          normalizedText: 'Second task',
          fingerprint: 'task-2'
        })
      ]
    })

    const taskItems = model.groups.find((group) => group.id === 'tasks')?.items ?? []

    expect(taskItems.map((item) => item.active)).toEqual([false, true])
  })

  it('keeps a recent file visible when it matches a smart rule but is not rendered above recent', () => {
    const catalogFiles = Array.from({ length: 11 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0')
      const date = `2026-06-${day}`

      return catalogEntry({
        sourcePath: `sessions/${date}/briefing-${date}.md`,
        title: `briefing-${date}`,
        directory: `sessions/${date}`,
        searchableText: `briefing ${date} sessions/${date}/briefing-${date}.md`,
        pathDate: date,
        modifiedAtMs: index + 1
      })
    })

    const model = buildHomeSidebarModel({
      activeTabId: null,
      catalogFiles,
      recents: [
        {
          sourcePath: 'sessions/2026-06-01/briefing-2026-06-01.md',
          title: 'briefing-2026-06-01.md',
          openedAt: '2026-05-26T12:00:00.000Z'
        }
      ],
      tabs: []
    })

    expect(
      model.groups.find((group) => group.id === 'briefing')?.items.map((item) => item.sourcePath)
    ).not.toContain('sessions/2026-06-01/briefing-2026-06-01.md')
    expect(
      model.groups.find((group) => group.id === 'recent')?.items.map((item) => item.sourcePath)
    ).toEqual(['sessions/2026-06-01/briefing-2026-06-01.md'])
  })

  it('falls back to file names when persisted titles are blank', () => {
    const model = buildHomeSidebarModel({
      activeTabId: null,
      catalogFiles: [
        catalogEntry({
          sourcePath: 'briefings/daily-briefing.md',
          title: '',
          searchableText: 'briefings/daily-briefing.md',
          createdAtMs: 300
        }),
        catalogEntry({
          sourcePath: 'plans/catalog-plan.md',
          title: '',
          searchableText: 'plans/catalog-plan.md',
          modifiedAtMs: 200
        })
      ],
      recents: [
        {
          sourcePath: 'docs/overview.md',
          title: '  ',
          openedAt: '2026-05-26T12:00:00.000Z'
        }
      ],
      tabs: []
    })

    expect(model.groups.find((group) => group.id === 'briefing')?.items[0]?.title).toBe(
      'daily-briefing.md'
    )
    expect(model.groups.find((group) => group.id === 'plans')?.items[0]?.title).toBe(
      'catalog-plan.md'
    )
    expect(model.groups.find((group) => group.id === 'recent')?.items[0]?.title).toBe('overview.md')
  })

  it('ranks plans by recent activity before modified time and caps at 10 items', () => {
    const catalogFiles = Array.from({ length: 12 }, (_, index) =>
      catalogEntry({
        sourcePath: `plans/plan-${index}.md`,
        title: `plan-${index}`,
        searchableText: `plan-${index} plans/plan-${index}.md`,
        modifiedAtMs: index
      })
    )

    const model = buildHomeSidebarModel({
      activeTabId: null,
      catalogFiles,
      recents: [
        {
          sourcePath: 'plans/plan-2.md',
          title: 'plan-2.md',
          openedAt: '2026-05-26T13:00:00.000Z'
        },
        {
          sourcePath: 'plans/plan-1.md',
          title: 'plan-1.md',
          openedAt: '2026-05-26T12:00:00.000Z'
        }
      ],
      tabs: []
    })

    const plans = model.groups.find((group) => group.id === 'plans')
    expect(plans?.items).toHaveLength(10)
    expect(plans?.items.map((item) => item.sourcePath).slice(0, 3)).toEqual([
      'plans/plan-2.md',
      'plans/plan-1.md',
      'plans/plan-11.md'
    ])
  })

  it('matches plan, planning, shaping, and breadboard tokens from catalog searchable text', () => {
    const model = buildHomeSidebarModel({
      activeTabId: null,
      catalogFiles: [
        catalogEntry({
          sourcePath: 'sessions/brief.md',
          title: 'brief',
          searchableText: 'brief sessions/brief.md'
        }),
        catalogEntry({
          sourcePath: 'planning/work.md',
          title: 'work',
          searchableText: 'work planning/work.md',
          modifiedAtMs: 200
        }),
        catalogEntry({
          sourcePath: 'docs/explanation.md',
          title: 'explanation',
          searchableText: 'explanation docs/explanation.md',
          modifiedAtMs: 500
        }),
        catalogEntry({
          sourcePath: 'sessions/shaping/widget.md',
          title: 'widget',
          searchableText: 'widget sessions/shaping/widget.md',
          modifiedAtMs: 300
        }),
        catalogEntry({
          sourcePath: 'sessions/breadboard/widget.md',
          title: 'widget',
          searchableText: 'widget sessions/breadboard/widget.md',
          modifiedAtMs: 400
        })
      ],
      recents: [],
      tabs: []
    })

    expect(
      model.groups.find((group) => group.id === 'plans')?.items.map((item) => item.sourcePath)
    ).toEqual(['sessions/breadboard/widget.md', 'sessions/shaping/widget.md', 'planning/work.md'])
  })

  it('ranks briefings by parsed path date before filesystem timestamps', () => {
    const model = buildHomeSidebarModel({
      activeTabId: null,
      catalogFiles: [
        catalogEntry({
          sourcePath: 'sessions/2026-06-01/briefing-2026-06-01.md',
          title: 'briefing-2026-06-01',
          searchableText: 'briefing 2026 06 01 sessions/2026-06-01/briefing-2026-06-01.md',
          pathDate: '2026-06-01',
          createdAtMs: 900
        }),
        catalogEntry({
          sourcePath: 'sessions/2026-06-22/briefing-2026-06-22.md',
          title: 'briefing-2026-06-22',
          searchableText: 'briefing 2026 06 22 sessions/2026-06-22/briefing-2026-06-22.md',
          pathDate: '2026-06-22',
          createdAtMs: 100
        })
      ],
      recents: [],
      tabs: []
    })

    expect(
      model.groups.find((group) => group.id === 'briefing')?.items.map((item) => item.sourcePath)
    ).toEqual([
      'sessions/2026-06-22/briefing-2026-06-22.md',
      'sessions/2026-06-01/briefing-2026-06-01.md'
    ])
  })

  it('formats briefing row titles as the distinctive date', () => {
    const model = buildHomeSidebarModel({
      activeTabId: null,
      catalogFiles: [
        catalogEntry({
          sourcePath: 'sessions/2026-06-22/briefing-2026-06-22.md',
          title: 'briefing-2026-06-22',
          searchableText: 'briefing-2026-06-22 sessions/2026-06-22/briefing-2026-06-22.md'
        })
      ],
      recents: [],
      tabs: []
    })
    const briefingItem = model.groups.find((group) => group.id === 'briefing')?.items[0]

    expect(briefingItem).toBeDefined()
    expect(homeSmartGroupItemTitle(briefingItem!)).toBe('2026-06-22')
    expect(
      homeSmartGroupItemTitle(briefingItem!, 'Morning Briefing -- Monday, June 22, 2026')
    ).toBe('Monday, June 22, 2026')
    expect(
      homeSmartGroupItemTitle(briefingItem!, 'Morning Briefing \u2014 Monday, June 22, 2026')
    ).toBe('Monday, June 22, 2026')
  })
})
