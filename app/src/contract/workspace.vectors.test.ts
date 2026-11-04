import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import type { ZodSafeParseResult } from 'zod'

import { MAX_PATH_LENGTH } from '../shared/source-path'
import { decode } from './tasks.vectors.codec'
import { ACCEPTED_DEVIATIONS } from './workspace.vectors.deviations'
import {
  LIBRARY_KEYS,
  SHELL_KEYS,
  WORKSPACE_VECTOR_OPS,
  workspaceVectors,
  type WorkspaceVectorOp
} from './workspace.vectors.inputs'
import {
  closeTab,
  focusTab,
  openFile,
  openRecentFile,
  recordRecent,
  setOutlineCollapsed,
  setOutlineWidth,
  updateLibrary,
  updateShell,
  updateTabViewMode
} from './workspace'

interface RecordedVector {
  id: string
  op: WorkspaceVectorOp
  accepted: boolean
  output?: unknown
  legacyMessage?: string
}

const file = JSON.parse(
  readFileSync(fileURLToPath(new URL('./workspace.vectors.expected.json', import.meta.url)), 'utf8')
) as {
  header: {
    recordedFrom: string
    baseSha: string
    extensions: { baseSha: string; ops: WorkspaceVectorOp[] }[]
  }
  vectors: RecordedVector[]
}

const recorded = file.vectors
const byId = new Map(recorded.map((vector) => [vector.id, vector]))
const idsOf = (vectors: { id: string }[]): string[] => vectors.map((vector) => vector.id)

const schemas: Record<
  WorkspaceVectorOp,
  { safeParse(input: unknown): ZodSafeParseResult<unknown> }
> = {
  shell: updateShell.input,
  library: updateLibrary.input,
  focusTab: focusTab.input,
  closeTab: closeTab.input,
  viewMode: updateTabViewMode.input,
  outlineCollapsed: setOutlineCollapsed.input,
  outlineWidth: setOutlineWidth.input,
  openFile: openFile.input,
  openRecentFile: openRecentFile.input,
  recordRecent: recordRecent.input
}

describe('the workspace oracle recorded from the pre-change validators', () => {
  it('records exactly one expectation for every authored vector, with unique ids', () => {
    expect(idsOf(recorded)).toEqual(idsOf(workspaceVectors))
    expect(recorded.map((vector) => vector.op)).toEqual(workspaceVectors.map((vector) => vector.op))
    expect(new Set(idsOf(workspaceVectors)).size).toBe(workspaceVectors.length)
  })

  it('names the commits it was recorded from', () => {
    expect(file.header.recordedFrom).toMatch(/^[0-9a-f]{40}$/)
    expect(file.header.baseSha).toMatch(/^[0-9a-f]{40}$/)
    // The file operations were added later, recorded from the validators at the commit before they moved.
    expect(file.header.extensions).toHaveLength(1)
    expect(file.header.extensions[0]!.baseSha).toMatch(/^[0-9a-f]{40}$/)
    expect(file.header.extensions[0]!.ops).toEqual(['openFile', 'openRecentFile', 'recordRecent'])
  })

  it('keeps ids that cannot be mistaken for a channel name', () => {
    for (const vector of workspaceVectors) {
      expect(vector.id, vector.id).toMatch(
        /^(shell|library|focusTab|closeTab|viewMode|outlineCollapsed|outlineWidth|openFile|openRecentFile|recordRecent): /
      )
    }
  })

  it('has accepted and rejected examples for every operation', () => {
    for (const op of WORKSPACE_VECTOR_OPS) {
      const ofOp = recorded.filter((vector) => vector.op === op)
      expect(
        ofOp.some((vector) => vector.accepted),
        `${op} accepted`
      ).toBe(true)
      expect(
        ofOp.some((vector) => !vector.accepted),
        `${op} rejected`
      ).toBe(true)
    }
  })

  it('covers every key of the old patch validators with an accepted and a rejected value', () => {
    const cases = [
      ...SHELL_KEYS.map((key) => ['shell', key] as const),
      ...LIBRARY_KEYS.map((key) => ['library', key] as const)
    ]
    for (const [op, key] of cases) {
      const own = recorded.filter((vector) => vector.id.startsWith(`${op}: ${key} `))
      expect(
        own.some((vector) => vector.accepted),
        `${op} ${key} accepted`
      ).toBe(true)
      expect(
        own.some((vector) => !vector.accepted),
        `${op} ${key} rejected`
      ).toBe(true)
    }
  })

  it('lists exactly the keys the old validators allow, proved by their own answers', () => {
    // An allowed key with an explicit undefined fails on its value; an unknown key fails on the key itself.
    for (const [op, key, unknownKeyMessage] of [
      ...SHELL_KEYS.map((key) => ['shell', key, /^Invalid workspace shell key/] as const),
      ...LIBRARY_KEYS.map((key) => ['library', key, /^Invalid workspace library key/] as const)
    ]) {
      const vector = byId.get(`${op}: ${key} explicit undefined`)
      expect(vector?.accepted, key).toBe(false)
      expect(vector?.legacyMessage, key).not.toMatch(unknownKeyMessage)
    }
    expect(byId.get('shell: only an unknown key')?.legacyMessage).toMatch(
      /^Invalid workspace shell key/
    )
    expect(byId.get('library: only an unknown key')?.legacyMessage).toMatch(
      /^Invalid workspace library key/
    )
  })

  it('keeps the vectors that distinguish a strict schema from a lenient one', () => {
    const ids = new Set(idsOf(workspaceVectors))
    const required = [
      // shapes and prototypes
      'shell: undefined',
      'shell: null',
      'shell: empty array',
      'shell: Date instance',
      'shell: class instance with a valid own field',
      'shell: null-prototype object with a valid key',
      'shell: symbol key is ignored',
      'shell: own __proto__ key',
      'shell: inherited valid key only',
      'shell: inherited unknown key only',
      'focusTab: inherited valid key only',
      'outlineWidth: inherited valid key only',
      // bounds
      'shell: sidebarWidth 4000',
      'shell: sidebarWidth 4001',
      'shell: sidebarWidth 0',
      'shell: sidebarWidth negative zero',
      'shell: sidebarWidth NaN',
      'shell: sidebarWidth Infinity',
      'shell: sidebarWidth fractional',
      'library: scrollTop negative zero',
      'library: scrollTop negative',
      'library: scrollTop Infinity',
      'library: scrollTop max value',
      'outlineWidth: width 1000',
      'outlineWidth: width 1000.5',
      'outlineWidth: width 1001',
      'outlineWidth: width 0',
      'outlineWidth: width tiny positive',
      // paths and the folder map
      'library: expandedFolders dot-slash is normalized',
      'library: expandedFolders sparse',
      'library: expandedFolders duplicates are kept',
      `library: expandedFolders entry at ${MAX_PATH_LENGTH} characters`,
      `library: expandedFolders entry at ${MAX_PATH_LENGTH + 1} characters`,
      'library: folderSortModes dot-slash key is normalized',
      'library: folderSortModes two keys that normalize alike',
      'library: folderSortModes nested key',
      'library: folderSortModes own __proto__ key',
      'library: folderSortModes Map instance',
      'outlineCollapsed: sourcePath dot-slash is normalized',
      'outlineCollapsed: sourcePath parent traversal',
      `outlineCollapsed: sourcePath at ${MAX_PATH_LENGTH} characters`,
      `outlineCollapsed: sourcePath at ${MAX_PATH_LENGTH + 1} characters`,
      // tab ids and the view mode
      'focusTab: tabId 200 characters',
      'focusTab: tabId 201 characters',
      'focusTab: tabId trailing newline',
      'focusTab: tabId NUL',
      'closeTab: tabId trailing newline',
      'viewMode: tabId trailing newline',
      'viewMode: unknown viewMode',
      'viewMode: viewMode different case',
      'viewMode: viewMode explicit undefined',
      // open-file and record-recent
      ...(['openFile', 'recordRecent'] as const).flatMap((op) => [
        `${op}: undefined`,
        `${op}: inherited valid key only`,
        `${op}: inherited unknown key only`,
        `${op}: own __proto__ key`,
        `${op}: externalPath is not a key`,
        `${op}: valid sourcePath with externalPath undefined`,
        `${op}: sourcePath explicit undefined`,
        `${op}: sourcePath dot-slash is normalized`,
        `${op}: sourcePath parent traversal`,
        `${op}: sourcePath absolute`,
        `${op}: sourcePath NUL`,
        `${op}: sourcePath ${MAX_PATH_LENGTH} characters`,
        `${op}: sourcePath ${MAX_PATH_LENGTH + 1} characters`
      ]),
      // open-recent-file: the exactly-one-of rule and the external path rules
      'openRecentFile: neither key',
      'openRecentFile: both keys valid',
      'openRecentFile: sourcePath with externalPath undefined',
      'openRecentFile: externalPath with sourcePath undefined',
      'openRecentFile: both keys undefined',
      'openRecentFile: sourcePath explicit undefined',
      'openRecentFile: externalPath explicit undefined',
      'openRecentFile: sourcePath with externalPath null',
      'openRecentFile: externalPath typical',
      'openRecentFile: externalPath other extension',
      'openRecentFile: externalPath normalized away from a directory',
      'openRecentFile: externalPath normalizes to a non-markdown file',
      'openRecentFile: externalPath relative',
      'openRecentFile: externalPath windows drive',
      'openRecentFile: externalPath windows UNC',
      'openRecentFile: externalPath NUL',
      `openRecentFile: externalPath ${MAX_PATH_LENGTH} characters`,
      `openRecentFile: externalPath ${MAX_PATH_LENGTH + 1} characters`
    ]
    for (const id of required) expect(ids.has(id), id).toBe(true)

    const inputs = workspaceVectors.map((vector) => vector.input)
    const objects = inputs.filter(
      (input): input is Record<string, unknown> => typeof input === 'object' && input !== null
    )
    expect(objects.some((object) => Object.keys(object).includes('__proto__'))).toBe(true)
    expect(objects.some((object) => Object.getOwnPropertySymbols(object).length > 0)).toBe(true)
    expect(objects.some((object) => Object.getPrototypeOf(object) === null)).toBe(true)
    expect(objects.some((object) => Object.values(object).includes(undefined))).toBe(true)
    expect(
      objects.some((object) => Object.values(object).some((value) => Number.isNaN(value)))
    ).toBe(true)
    expect(
      objects.some((object) =>
        Object.values(object).some((value) => value === Number.POSITIVE_INFINITY)
      )
    ).toBe(true)
    expect(inputs).toContain(undefined)
    expect(inputs).toContain(null)
  })

  it('captured the behaviors the new schemas have to decide on', () => {
    // These facts come from the old validators and make a re-recording from the wrong code noticeable.
    const accepted = (id: string): unknown => {
      const vector = byId.get(id)
      expect(vector?.accepted, id).toBe(true)
      return decode(vector?.output)
    }

    expect(accepted('shell: inherited valid key only')).toStrictEqual({ sidebarCollapsed: true })
    expect(accepted('shell: Date instance')).toStrictEqual({})
    expect(accepted('focusTab: inherited valid key only')).toStrictEqual({ tabId: 'tab-1' })
    expect(accepted('library: expandedFolders dot-slash is normalized')).toStrictEqual({
      expandedFolders: ['docs']
    })
    expect(accepted('library: expandedFolders duplicates are kept')).toStrictEqual({
      expandedFolders: ['docs', 'docs', 'docs']
    })
    expect(accepted('library: folderSortModes two keys that normalize alike')).toStrictEqual({
      folderSortModes: { docs: 'recency' }
    })
    expect(accepted('library: folderSortModes own __proto__ key')).toStrictEqual({
      folderSortModes: {}
    })
    expect(accepted('library: scrollTop negative zero')).toStrictEqual({ scrollTop: -0 })
    expect(accepted('outlineWidth: width 1000')).toStrictEqual({ width: 1000 })
    expect(accepted('openFile: sourcePath dot-slash is normalized')).toStrictEqual({
      sourcePath: 'a.md'
    })
    expect(accepted('openFile: inherited valid key only')).toStrictEqual({ sourcePath: 'a.md' })
    expect(accepted('recordRecent: sourcePath redundant separators are normalized')).toStrictEqual({
      sourcePath: 'docs/a.md'
    })
    expect(accepted('openRecentFile: sourcePath with externalPath undefined')).toStrictEqual({
      sourcePath: 'a.md'
    })
    expect(accepted('openRecentFile: externalPath with sourcePath undefined')).toStrictEqual({
      externalPath: '/tmp/a.md'
    })
    expect(accepted('openRecentFile: externalPath normalized away from a directory')).toStrictEqual(
      { externalPath: '/tmp/a.md' }
    )
    expect(accepted('openRecentFile: externalPath windows drive')).toStrictEqual({
      externalPath: 'C:\\Notes\\a.md'
    })

    for (const id of [
      'shell: sidebarCollapsed explicit undefined',
      'shell: sidebarWidth 4001',
      'shell: sidebarWidth negative zero',
      'library: folderSortModes nested key',
      'library: folderSortModes own __proto__ key with an invalid mode',
      'focusTab: tabId trailing newline',
      'viewMode: viewMode explicit undefined',
      'outlineWidth: width 1000.5',
      'outlineWidth: width 0',
      'openFile: valid sourcePath with externalPath undefined',
      'openFile: externalPath is not a key',
      'openFile: sourcePath explicit undefined',
      'recordRecent: sourcePath explicit undefined',
      'recordRecent: title is not a key',
      'openRecentFile: neither key',
      'openRecentFile: both keys valid',
      'openRecentFile: both keys undefined',
      'openRecentFile: externalPath other extension',
      'openRecentFile: externalPath normalizes to a non-markdown file',
      'openRecentFile: externalPath relative'
    ]) {
      expect(byId.get(id)?.accepted, id).toBe(false)
    }
  })
})

describe('workspace contract against the golden vectors recorded from the pre-change validators', () => {
  it.each(workspaceVectors.map((vector, index) => [vector.id, vector, recorded[index]] as const))(
    '%s',
    (_id, vector, expected) => {
      const result = schemas[vector.op].safeParse(vector.input)
      const deviation = ACCEPTED_DEVIATIONS[vector.id]
      if (deviation) {
        expect(expected.accepted, 'the legacy validator accepted this input').toBe(true)
        expect(result.success, deviation.reason).toBe(deviation.accepted)
        return
      }
      expect(result.success, `accept/reject for ${vector.id}`).toBe(expected.accepted)
      if (expected.accepted && result.success) {
        expect(result.data).toStrictEqual(decode(expected.output))
      }
    }
  )
})
