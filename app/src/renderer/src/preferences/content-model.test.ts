import { describe, expect, it } from 'vitest'

import {
  RETENTION_OPTIONS,
  formatIndexedAt,
  formatValidatedAt,
  indexSummary
} from './content-model'
import type { IndexerStatus } from '../../../preload'

function status(overrides: Partial<IndexerStatus> = {}): IndexerStatus {
  return {
    phase: 'idle',
    filesTotal: 0,
    filesDone: 0,
    chunksTotal: 0,
    chunksDone: 0,
    lastIndexedAt: null,
    ...overrides
  }
}

describe('formatIndexedAt', () => {
  it("writes the date as the design does, in the viewer's time zone", () => {
    expect(formatIndexedAt('2026-10-24T04:40:52.000Z', 'America/New_York')).toBe(
      'October 24, 2026 12:40:52 am ET'
    )
    expect(formatIndexedAt('2026-10-23T19:04:59.000Z', 'America/New_York')).toBe(
      'October 23, 2026 3:04:59 pm ET'
    )
  })
})

describe('formatValidatedAt', () => {
  it('writes the date as the key status line does', () => {
    expect(formatValidatedAt('2026-10-23T19:04:59.000Z', 'America/New_York')).toBe(
      'October 23, 2026, 3:04:59 PM ET'
    )
  })
})

describe('indexSummary', () => {
  it('shows nothing when nothing has been indexed, so there are no actions with nothing to act on', () => {
    expect(indexSummary(status(), 'America/New_York')).toEqual({ state: 'none', text: '' })
    expect(indexSummary(status({ phase: 'done' }), 'America/New_York').state).toBe('none')
  })

  it('reports when the index was built and how big it is', () => {
    expect(
      indexSummary(
        status({
          phase: 'done',
          filesTotal: 3245,
          chunksTotal: 41015,
          lastIndexedAt: '2026-10-24T04:40:52.000Z'
        }),
        'America/New_York'
      )
    ).toEqual({
      state: 'ready',
      text: 'Local data last indexed October 24, 2026 12:40:52 am ET. Indexed 3,245 files, 41,015 chunks.'
    })
  })

  it('says how far along it is while indexing', () => {
    expect(
      indexSummary(status({ phase: 'indexing', filesTotal: 3245, filesDone: 1200 }), 'UTC')
    ).toEqual({ state: 'busy', text: 'Indexing 1,200 of 3,245 files.' })
    expect(indexSummary(status({ phase: 'walking' }), 'UTC')).toEqual({
      state: 'busy',
      text: 'Scanning the folder.'
    })
  })

  it('shows the error when indexing failed', () => {
    expect(indexSummary(status({ phase: 'error', error: 'Disk full' }), 'UTC')).toEqual({
      state: 'error',
      text: 'Disk full'
    })
  })
})

describe('retention options', () => {
  it('lists the history choices, marking the default', () => {
    expect(RETENTION_OPTIONS).toEqual([
      { value: 'off', label: 'Off' },
      { value: 'session', label: 'This session only' },
      { value: '7-days', label: '7 days' },
      { value: '30-days', label: '30 days (default)' },
      { value: 'forever', label: 'Forever' }
    ])
  })
})
