import type { FileCatalogEntry } from '../../../shared/files'
import type { MarkdownTaskFact } from '../../../shared/tasks'
import {
  isWorkspaceSourceFileRef,
  type WorkspaceFileTab,
  type WorkspaceRecentFile,
  type WorkspaceSourceFileRef
} from '../../../shared/workspace'

export type HomeSmartGroupId = 'tasks' | 'briefing' | 'plans' | 'recent'

export interface HomeSmartGroupItemAction {
  kind: 'open-explicit-file'
  sourcePath: string
}

export interface HomeSmartGroupItem {
  id: string
  sourcePath: string
  title: string
  titleFormat?: 'briefing-date'
  detail?: string
  taskFingerprint?: string
  active: boolean
  ariaLabel: string
  action: HomeSmartGroupItemAction
}

export interface HomeSmartGroup {
  id: HomeSmartGroupId
  title: string
  headingId: string
  emptyLabel: string
  items: HomeSmartGroupItem[]
}

export interface HomeSidebarModel {
  groups: HomeSmartGroup[]
}

interface HomeSidebarModelInput {
  catalogFiles: FileCatalogEntry[]
  recents: WorkspaceRecentFile[]
  tabs: WorkspaceFileTab[]
  activeTabId: string | null
  taskFacts?: MarkdownTaskFact[]
  activeTaskFingerprint?: string | null
}

type SourceWorkspaceRecentFile = WorkspaceRecentFile & WorkspaceSourceFileRef

function isSourceWorkspaceRecentFile(
  recent: WorkspaceRecentFile
): recent is SourceWorkspaceRecentFile {
  return isWorkspaceSourceFileRef(recent)
}

interface HomeSidebarModelContext extends HomeSidebarModelInput {
  recents: SourceWorkspaceRecentFile[]
  activeSourcePath: string | null
  activeTaskFingerprint: string | null
  catalogFilesBySourcePath: Map<string, FileCatalogEntry>
  recentOpenedAtMsBySourcePath: Map<string, number>
}

interface HomeSmartGroupDefinition {
  id: HomeSmartGroupId
  title: string
  emptyLabel: string
  contributesToRecentDedupe?: boolean
  buildItems: (context: HomeSidebarModelContext) => HomeSmartGroupItem[]
}

const MORNING_BRIEFING_TITLE_RE = /^morning\s+briefing\s*(?:--|[\u2013\u2014-])\s*/i
const BRIEFING_FILE_DATE_RE = /^briefing[-_ ]+(\d{4}-\d{2}-\d{2})$/i
const SEARCH_TOKEN_RE = /[a-z0-9]+/g
const PLANS_TOKENS = new Set(['plan', 'plans', 'planning', 'shaping', 'breadboard'])
const BRIEFING_TOKENS = new Set(['briefing', 'briefings'])

function titleFromSourcePath(sourcePath: string): string {
  const parts = sourcePath.split(/[\\/]+/).filter(Boolean)
  return parts.at(-1) ?? sourcePath
}

function displayTitle(title: string, sourcePath: string): string {
  return title.trim() || titleFromSourcePath(sourcePath)
}

function briefingDateTitle(title: string): string {
  const trimmed = title.trim()
  const withoutPrefix = trimmed.replace(MORNING_BRIEFING_TITLE_RE, '').trim()
  if (withoutPrefix && withoutPrefix !== trimmed) return withoutPrefix

  return BRIEFING_FILE_DATE_RE.exec(trimmed)?.[1] ?? trimmed
}

export function homeSmartGroupItemTitle(item: HomeSmartGroupItem, documentTitle?: string): string {
  const title = displayTitle(documentTitle ?? item.title, item.sourcePath)
  return item.titleFormat === 'briefing-date' ? briefingDateTitle(title) : title
}

function recentOpenedAtMs(recent: WorkspaceRecentFile): number | null {
  const ms = Date.parse(recent.openedAt)
  return Number.isFinite(ms) ? ms : null
}

function sourceDateMs(file: FileCatalogEntry): number | null {
  if (!file.pathDate) return null

  const ms = Date.parse(`${file.pathDate}T00:00:00.000Z`)
  return Number.isFinite(ms) ? ms : null
}

function searchableTokens(file: FileCatalogEntry): Set<string> {
  return new Set(file.searchableText.match(SEARCH_TOKEN_RE) ?? [])
}

function hasAnyToken(file: FileCatalogEntry, allowedTokens: Set<string>): boolean {
  for (const token of searchableTokens(file)) {
    if (allowedTokens.has(token)) return true
  }

  return false
}

function matchesPlansRule(file: FileCatalogEntry): boolean {
  return hasAnyToken(file, PLANS_TOKENS)
}

function matchesBriefingRule(file: FileCatalogEntry): boolean {
  return hasAnyToken(file, BRIEFING_TOKENS)
}

function taskDetail(task: MarkdownTaskFact): string {
  return task.headingPath.length > 0
    ? `${task.sourcePath} \u203a ${task.headingPath.join(' \u203a ')}`
    : task.sourcePath
}

function rankBriefingItems(left: FileCatalogEntry, right: FileCatalogEntry): number {
  const leftDateMs = sourceDateMs(left)
  const rightDateMs = sourceDateMs(right)

  if (leftDateMs !== null || rightDateMs !== null) {
    if (leftDateMs === null) return 1
    if (rightDateMs === null) return -1
    if (leftDateMs !== rightDateMs) return rightDateMs - leftDateMs
  }

  const leftCreatedAtMs = left.createdAtMs ?? left.modifiedAtMs
  const rightCreatedAtMs = right.createdAtMs ?? right.modifiedAtMs

  if (leftCreatedAtMs !== rightCreatedAtMs) return rightCreatedAtMs - leftCreatedAtMs
  return left.sourcePath.localeCompare(right.sourcePath)
}

function rankPlansItems(
  left: FileCatalogEntry,
  right: FileCatalogEntry,
  recentOpenedAtMsBySourcePath: Map<string, number>
): number {
  const leftOpenedAtMs = recentOpenedAtMsBySourcePath.get(left.sourcePath) ?? null
  const rightOpenedAtMs = recentOpenedAtMsBySourcePath.get(right.sourcePath) ?? null

  if (leftOpenedAtMs !== null || rightOpenedAtMs !== null) {
    if (leftOpenedAtMs === null) return 1
    if (rightOpenedAtMs === null) return -1
    if (leftOpenedAtMs !== rightOpenedAtMs) return rightOpenedAtMs - leftOpenedAtMs
  }

  if (left.modifiedAtMs !== right.modifiedAtMs) return right.modifiedAtMs - left.modifiedAtMs
  return left.sourcePath.localeCompare(right.sourcePath)
}

const HOME_SMART_GROUP_DEFINITIONS: HomeSmartGroupDefinition[] = [
  {
    id: 'tasks',
    title: 'Tasks',
    emptyLabel: 'No open tasks',
    buildItems: (context) =>
      (context.taskFacts ?? [])
        .filter((task) => !task.checked)
        .slice(0, 10)
        .map((task) => ({
          id: `tasks:${task.fingerprint}`,
          sourcePath: task.sourcePath,
          title: task.normalizedText,
          detail: taskDetail(task),
          taskFingerprint: task.fingerprint,
          active: task.fingerprint === context.activeTaskFingerprint,
          ariaLabel: `Open task ${task.normalizedText} in ${task.sourcePath}`,
          action: {
            kind: 'open-explicit-file',
            sourcePath: task.sourcePath
          }
        }))
  },
  {
    id: 'briefing',
    title: 'Briefing',
    emptyLabel: 'No briefings',
    contributesToRecentDedupe: true,
    buildItems: (context) =>
      context.catalogFiles
        .filter(matchesBriefingRule)
        .sort(rankBriefingItems)
        .slice(0, 10)
        .map((file) => ({
          id: `briefing:${file.sourcePath}`,
          sourcePath: file.sourcePath,
          title: displayTitle(file.title, file.sourcePath),
          titleFormat: 'briefing-date',
          active: file.sourcePath === context.activeSourcePath,
          ariaLabel: `Open ${file.sourcePath}`,
          action: {
            kind: 'open-explicit-file',
            sourcePath: file.sourcePath
          }
        }))
  },
  {
    id: 'plans',
    title: 'Plans',
    emptyLabel: 'No plans',
    contributesToRecentDedupe: true,
    buildItems: (context) =>
      context.catalogFiles
        .filter(matchesPlansRule)
        .sort((left, right) => rankPlansItems(left, right, context.recentOpenedAtMsBySourcePath))
        .slice(0, 10)
        .map((file) => ({
          id: `plans:${file.sourcePath}`,
          sourcePath: file.sourcePath,
          title: displayTitle(file.title, file.sourcePath),
          active: file.sourcePath === context.activeSourcePath,
          ariaLabel: `Open ${file.sourcePath}`,
          action: {
            kind: 'open-explicit-file',
            sourcePath: file.sourcePath
          }
        }))
  },
  {
    id: 'recent',
    title: 'Recent',
    emptyLabel: 'No recent files',
    buildItems: (context) =>
      context.recents.map((recent) => {
        const catalogFile = context.catalogFilesBySourcePath.get(recent.sourcePath)

        return {
          id: `recent:${recent.sourcePath}`,
          sourcePath: recent.sourcePath,
          title: displayTitle(catalogFile?.title ?? recent.title, recent.sourcePath),
          active: recent.sourcePath === context.activeSourcePath,
          ariaLabel: `Open ${recent.sourcePath}`,
          action: {
            kind: 'open-explicit-file',
            sourcePath: recent.sourcePath
          }
        }
      })
  }
]

export function buildHomeSidebarModel(input: HomeSidebarModelInput): HomeSidebarModel {
  const activeTab = input.tabs.find((tab) => tab.id === input.activeTabId) ?? null
  const activeSourcePath =
    activeTab && isWorkspaceSourceFileRef(activeTab) ? activeTab.sourcePath : null
  const sourceRecents = input.recents.filter(isSourceWorkspaceRecentFile)
  const context: HomeSidebarModelContext = {
    ...input,
    recents: sourceRecents,
    taskFacts: input.taskFacts ?? [],
    activeTaskFingerprint: input.activeTaskFingerprint ?? null,
    activeSourcePath,
    catalogFilesBySourcePath: new Map(input.catalogFiles.map((file) => [file.sourcePath, file])),
    recentOpenedAtMsBySourcePath: new Map(
      sourceRecents.flatMap((recent) => {
        const openedAtMs = recentOpenedAtMs(recent)
        return openedAtMs === null ? [] : [[recent.sourcePath, openedAtMs]]
      })
    )
  }

  const renderedSourcePaths = new Set<string>()
  const groups = HOME_SMART_GROUP_DEFINITIONS.map((definition) => {
    const builtItems = definition.buildItems(context)
    const items =
      definition.id === 'recent'
        ? builtItems.filter((item) => !renderedSourcePaths.has(item.sourcePath))
        : builtItems

    if (definition.contributesToRecentDedupe) {
      for (const item of items) {
        renderedSourcePaths.add(item.sourcePath)
      }
    }

    return {
      id: definition.id,
      title: definition.title,
      headingId: `home-${definition.id}-heading`,
      emptyLabel: definition.emptyLabel,
      items
    }
  })

  return { groups }
}
