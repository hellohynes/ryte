import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import type { ZodSafeParseResult } from 'zod'

import { MAX_PATH_LENGTH } from '../shared/source-path'
import { ACCEPTED_DEVIATIONS } from './files.vectors.deviations'
import { FILES_VECTOR_OPS, filesVectors, type FilesVectorOp } from './files.vectors.inputs'
import {
  copyContent,
  copyPath,
  moveToTrash,
  readSourceTitle,
  readWorkspaceTab,
  rename,
  showInFinder
} from './files'
import { decode } from './tasks.vectors.codec'

interface RecordedVector {
  id: string
  op: FilesVectorOp
  accepted: boolean
  output?: unknown
  legacyMessage?: string
}

const file = JSON.parse(
  readFileSync(fileURLToPath(new URL('./files.vectors.expected.json', import.meta.url)), 'utf8')
) as { header: { recordedFrom: string; baseSha: string }; vectors: RecordedVector[] }

const recorded = file.vectors
const byId = new Map(recorded.map((vector) => [vector.id, vector]))
const idsOf = (vectors: { id: string }[]): string[] => vectors.map((vector) => vector.id)

// The four operations that take a file reference share one schema, so one set of vectors stands for all of them.
const FILE_REF_OPERATIONS = { copyContent, copyPath, showInFinder, moveToTrash }

const schemas: Record<FilesVectorOp, { safeParse(input: unknown): ZodSafeParseResult<unknown> }> = {
  fileRef: copyContent.input,
  rename: rename.input,
  sourceTitle: readSourceTitle.input,
  tabFile: readWorkspaceTab.input
}

describe('the files oracle recorded from the pre-change validators', () => {
  it('records exactly one expectation for every authored vector, with unique ids', () => {
    expect(idsOf(recorded)).toEqual(idsOf(filesVectors))
    expect(recorded.map((vector) => vector.op)).toEqual(filesVectors.map((vector) => vector.op))
    expect(new Set(idsOf(filesVectors)).size).toBe(filesVectors.length)
  })

  it('names the commit it was recorded from', () => {
    expect(file.header.recordedFrom).toMatch(/^[0-9a-f]{40}$/)
    expect(file.header.baseSha).toBe(file.header.recordedFrom)
  })

  it('keeps ids that cannot be mistaken for a channel name', () => {
    for (const vector of filesVectors) {
      expect(vector.id, vector.id).toMatch(/^(fileRef|rename|sourceTitle|tabFile): /)
    }
  })

  it('has accepted and rejected examples for every operation', () => {
    for (const op of FILES_VECTOR_OPS) {
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

  it('keeps the vectors that distinguish a strict schema from a lenient one', () => {
    const ids = new Set(idsOf(filesVectors))
    const required = [
      // shapes and prototypes, for every operation
      ...FILES_VECTOR_OPS.flatMap((op) => [
        `${op}: undefined`,
        `${op}: null`,
        `${op}: empty array`,
        `${op}: Date instance`,
        `${op}: class instance with a valid own field`,
        `${op}: null-prototype object with a valid key`,
        `${op}: symbol key is ignored`,
        `${op}: own __proto__ key`,
        `${op}: inherited valid key only`,
        `${op}: inherited unknown key only`,
        `${op}: valid key with an unknown key`
      ]),
      // the exactly-one-of rule, where an explicit undefined counts as absent
      'fileRef: neither key',
      'fileRef: both keys valid',
      'fileRef: sourcePath with externalPath undefined',
      'fileRef: externalPath with sourcePath undefined',
      'fileRef: both keys undefined',
      'fileRef: sourcePath explicit undefined',
      'fileRef: externalPath explicit undefined',
      'fileRef: sourcePath with externalPath null',
      'rename: neither key',
      'rename: both keys valid',
      'rename: sourcePath with externalPath undefined',
      'rename: externalPath with sourcePath undefined',
      'rename: both keys undefined',
      // source and external path rules
      'fileRef: sourcePath dot-slash is normalized',
      'fileRef: sourcePath parent traversal',
      'fileRef: sourcePath absolute',
      'fileRef: sourcePath NUL',
      `fileRef: sourcePath ${MAX_PATH_LENGTH} characters`,
      `fileRef: sourcePath ${MAX_PATH_LENGTH + 1} characters`,
      'fileRef: externalPath typical',
      'fileRef: externalPath upper-case extension',
      'fileRef: externalPath other extension',
      'fileRef: externalPath normalized away from a directory',
      'fileRef: externalPath normalizes to a non-markdown file',
      'fileRef: externalPath relative',
      'fileRef: externalPath windows drive',
      'fileRef: externalPath windows UNC',
      'fileRef: externalPath NUL',
      `fileRef: externalPath ${MAX_PATH_LENGTH} characters`,
      `fileRef: externalPath ${MAX_PATH_LENGTH + 1} characters`,
      'rename: sourcePath parent traversal',
      'rename: externalPath other extension',
      // the rename name rule
      'rename: name typical',
      'rename: name upper-case extension',
      'rename: name mixed-case extension',
      'rename: name hidden file named md',
      'rename: name no extension',
      'rename: name other extension',
      'rename: name 255 characters',
      'rename: name 256 characters',
      'rename: name dot only',
      'rename: name dot dot',
      'rename: name forward slash',
      'rename: name backslash',
      'rename: name NUL',
      'rename: name empty',
      'rename: name unicode',
      'rename: name explicit undefined',
      'rename: only a name',
      'rename: valid sourcePath without a name',
      // read-source-title
      'sourceTitle: externalPath is not a key',
      'sourceTitle: valid sourcePath with externalPath undefined',
      'sourceTitle: sourcePath dot-slash is normalized',
      'sourceTitle: sourcePath parent traversal',
      'sourceTitle: sourcePath explicit undefined',
      // read-workspace-tab
      'tabFile: tabId 200 characters',
      'tabFile: tabId 201 characters',
      'tabFile: tabId trailing newline',
      'tabFile: tabId NUL',
      'tabFile: tabId digit first',
      'tabFile: tabId dot first',
      'tabFile: tabId empty',
      'tabFile: tabId explicit undefined',
      'tabFile: valid tabId with a sourcePath'
    ]
    for (const id of required) expect(ids.has(id), id).toBe(true)

    const inputs = filesVectors.map((vector) => vector.input)
    const objects = inputs.filter(
      (input): input is Record<string, unknown> => typeof input === 'object' && input !== null
    )
    expect(objects.some((object) => Object.keys(object).includes('__proto__'))).toBe(true)
    expect(objects.some((object) => Object.getOwnPropertySymbols(object).length > 0)).toBe(true)
    expect(objects.some((object) => Object.getPrototypeOf(object) === null)).toBe(true)
    expect(objects.some((object) => Object.values(object).includes(undefined))).toBe(true)
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

    expect(accepted('fileRef: sourcePath with externalPath undefined')).toStrictEqual({
      sourcePath: 'a.md'
    })
    expect(accepted('fileRef: externalPath with sourcePath undefined')).toStrictEqual({
      externalPath: '/tmp/a.md'
    })
    expect(accepted('fileRef: externalPath normalized away from a directory')).toStrictEqual({
      externalPath: '/tmp/a.md'
    })
    expect(accepted('fileRef: externalPath windows drive')).toStrictEqual({
      externalPath: 'C:\\Notes\\a.md'
    })
    expect(accepted('rename: sourcePath with externalPath undefined')).toStrictEqual({
      sourcePath: 'a.md',
      name: 'b.md'
    })
    expect(accepted('rename: name upper-case extension')).toStrictEqual({
      sourcePath: 'docs/a.md',
      name: 'B.MD'
    })
    expect((accepted('rename: name 255 characters') as { name: string }).name).toHaveLength(255)
    expect(accepted('sourceTitle: sourcePath dot-slash is normalized')).toStrictEqual({
      sourcePath: 'a.md'
    })
    expect((accepted('tabFile: tabId 200 characters') as { tabId: string }).tabId).toHaveLength(200)
    expect(accepted('tabFile: inherited valid key only')).toStrictEqual({ tabId: 'tab-1' })

    for (const id of [
      'fileRef: neither key',
      'fileRef: both keys valid',
      'fileRef: both keys undefined',
      'fileRef: sourcePath explicit undefined',
      'fileRef: externalPath other extension',
      'fileRef: externalPath normalizes to a non-markdown file',
      'fileRef: externalPath relative',
      'rename: both keys valid',
      'rename: name hidden file named md',
      'rename: name no extension',
      'rename: name 256 characters',
      'rename: name dot dot',
      'rename: name forward slash',
      'rename: name backslash',
      'rename: name NUL',
      'rename: name empty',
      'rename: name explicit undefined',
      'rename: only a name',
      'sourceTitle: externalPath is not a key',
      'sourceTitle: valid sourcePath with externalPath undefined',
      'sourceTitle: sourcePath explicit undefined',
      'tabFile: tabId 201 characters',
      'tabFile: tabId trailing newline',
      'tabFile: tabId NUL',
      'tabFile: tabId dot first',
      'tabFile: tabId empty',
      'tabFile: tabId explicit undefined'
    ]) {
      expect(byId.get(id)?.accepted, id).toBe(false)
    }
  })
})

describe('the four file-reference operations', () => {
  it('share one input schema, so the vectors recorded for it hold for every one of them', () => {
    for (const operation of Object.values(FILE_REF_OPERATIONS)) {
      expect(operation.input, operation.channel).toBe(copyContent.input)
    }
    expect(moveToTrash.input).toBe(copyContent.input)
  })
})

describe('files contract against the golden vectors recorded from the pre-change validators', () => {
  it.each(filesVectors.map((vector, index) => [vector.id, vector, recorded[index]] as const))(
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
