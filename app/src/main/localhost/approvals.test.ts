import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createApprovals } from './approvals'

describe('approvals store', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ryte-approvals-'))
    file = join(dir, 'localhost-approvals.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('keeps an added origin across a restart', () => {
    createApprovals(() => file).add('http://localhost:5173')
    expect(createApprovals(() => file).list()).toEqual(['http://localhost:5173'])
  })

  it('removes an origin for good', () => {
    const approvals = createApprovals(() => file)
    approvals.add('http://localhost:5173')
    approvals.add('http://127.0.0.1:3000')
    approvals.remove('http://localhost:5173')
    expect(createApprovals(() => file).list()).toEqual(['http://127.0.0.1:3000'])
  })

  it('still reads the first layout, a bare array', () => {
    writeFileSync(file, JSON.stringify(['http://localhost:5173']))
    expect(createApprovals(() => file).list()).toEqual(['http://localhost:5173'])
  })

  it('writes a versioned file', () => {
    createApprovals(() => file).add('http://localhost:5173')
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({
      version: 1,
      origins: ['http://localhost:5173']
    })
  })

  it('ignores a damaged file and entries that are not local origins', () => {
    writeFileSync(file, '{not json')
    expect(createApprovals(() => file).list()).toEqual([])
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        origins: ['http://localhost:5173', 'http://example.com:80', 5]
      })
    )
    expect(createApprovals(() => file).list()).toEqual(['http://localhost:5173'])
  })
})
