import { describe, expect, it } from 'vitest'

import type { IndexerStatus } from '../../../preload'
import { indexMessage, statusBarView, type StatusBarInput } from './status-bar-model'

const index = (over: Partial<IndexerStatus>): IndexerStatus => ({
  phase: 'idle',
  filesTotal: 0,
  filesDone: 0,
  chunksTotal: 0,
  chunksDone: 0,
  lastIndexedAt: null,
  ...over
})

const input = (over: Partial<StatusBarInput>): StatusBarInput => ({
  workspaceError: null,
  index: index({}),
  localVisible: false,
  smartText: null,
  smartRunning: false,
  ...over
})

const ready = index({
  phase: 'done',
  filesTotal: 30,
  filesDone: 30,
  chunksTotal: 60,
  chunksDone: 60
})
const indexing = index({
  phase: 'indexing',
  filesTotal: 30,
  filesDone: 5,
  chunksTotal: 60,
  chunksDone: 10
})

describe('indexMessage: what the bar said before smart search', () => {
  it.each([
    ['walking', index({ phase: 'walking' }), 'Walking notes…'],
    ['indexing', indexing, 'Indexing 10/60 chunks · 5/30 files'],
    [
      'indexing with no chunk total yet',
      index({ phase: 'indexing', filesTotal: 3, filesDone: 1 }),
      'Indexing 0/? chunks · 1/3 files'
    ],
    ['done', ready, 'Index ready: 60 chunks across 30 files'],
    ['done with nothing indexed', index({ phase: 'done' }), ''],
    ['error', index({ phase: 'error', error: 'disk full' }), 'Indexing error: disk full'],
    ['error with no text', index({ phase: 'error' }), 'Indexing error: unknown'],
    ['idle', index({}), '']
  ])('%s', (_name, status, expected) => {
    expect(indexMessage(null, status)).toBe(expected)
  })

  it('puts a workspace error before everything', () => {
    expect(indexMessage('bad folder', ready)).toBe('Workspace error: bad folder')
  })
})

describe('statusBarView without smart search', () => {
  it('is unchanged: the index message, its tone, and visible only while the index message is', () => {
    expect(statusBarView(input({ index: indexing, localVisible: true }))).toEqual({
      message: 'Indexing 10/60 chunks · 5/30 files',
      tone: 'busy',
      visible: true
    })
    expect(statusBarView(input({ index: ready, localVisible: true }))).toEqual({
      message: 'Index ready: 60 chunks across 30 files',
      tone: 'ready',
      visible: true
    })
    expect(statusBarView(input({ index: ready, localVisible: false })).visible).toBe(false)
    expect(
      statusBarView(input({ index: index({ phase: 'error', error: 'x' }), localVisible: true }))
        .tone
    ).toBe('error')
  })

  it('shows a workspace error whatever else is going on', () => {
    expect(
      statusBarView(input({ workspaceError: 'bad', smartText: 'Smart search: 1 of 2 notes' }))
    ).toEqual({ message: 'Workspace error: bad', tone: 'error', visible: true })
  })
})

describe('statusBarView with smart search', () => {
  const smart = 'Smart search: 120 of 3,200 notes'

  it('shows it beside the index message, never in place of it', () => {
    expect(
      statusBarView(
        input({ index: indexing, localVisible: true, smartText: smart, smartRunning: true })
      )
    ).toEqual({
      message: `Indexing 10/60 chunks · 5/30 files · ${smart}`,
      tone: 'busy',
      visible: true
    })
    expect(
      statusBarView(
        input({ index: ready, localVisible: true, smartText: smart, smartRunning: true })
      )
    ).toEqual({
      message: `Index ready: 60 chunks across 30 files · ${smart}`,
      tone: 'ready',
      visible: true
    })
  })

  it('does not repeat an index message that has faded, and keeps the bar open for smart search alone', () => {
    expect(
      statusBarView(
        input({ index: ready, localVisible: false, smartText: smart, smartRunning: true })
      )
    ).toEqual({
      message: smart,
      tone: 'busy',
      visible: true
    })
  })

  it('shows a pause quietly, not as busy or an error', () => {
    const paused = statusBarView(
      input({ index: ready, localVisible: false, smartText: 'Smart search paused: no connection' })
    )
    expect(paused).toEqual({
      message: 'Smart search paused: no connection',
      tone: 'idle',
      visible: true
    })
  })

  it('does not hide an index error behind smart search', () => {
    const view = statusBarView(
      input({
        index: index({ phase: 'error', error: 'disk full' }),
        localVisible: true,
        smartText: smart,
        smartRunning: true
      })
    )
    expect(view.message).toBe(`Indexing error: disk full · ${smart}`)
    expect(view.tone).toBe('error')
  })

  it('stays closed when there is nothing to say', () => {
    expect(statusBarView(input({ index: ready, localVisible: false })).visible).toBe(false)
  })
})
