import type { IndexerStatus } from '../../../preload'
import type { SearchHistoryRetention } from '../../../main/settings/settings-store'

export const RETENTION_OPTIONS: ReadonlyArray<{ value: SearchHistoryRetention; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'session', label: 'This session only' },
  { value: '7-days', label: '7 days' },
  { value: '30-days', label: '30 days (default)' },
  { value: 'forever', label: 'Forever' }
]

/** "October 24, 2026 12:40:52 am ET", in the viewer's time zone unless one is given. */
export function formatIndexedAt(iso: string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'shortGeneric'
  }).formatToParts(new Date(iso))
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? ''
  return (
    `${part('month')} ${part('day')}, ${part('year')} ` +
    `${part('hour')}:${part('minute')}:${part('second')} ` +
    `${part('dayPeriod').toLowerCase()} ${part('timeZoneName')}`
  )
}

/** "October 23, 2026, 3:04:59 PM ET": when a key was last checked. */
export function formatValidatedAt(iso: string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'shortGeneric'
  }).formatToParts(new Date(iso))
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? ''
  return (
    `${part('month')} ${part('day')}, ${part('year')}, ` +
    `${part('hour')}:${part('minute')}:${part('second')} ${part('dayPeriod')} ${part('timeZoneName')}`
  )
}

export interface IndexSummary {
  /** `none`: there is no index yet, so the pane shows no index actions. */
  state: 'none' | 'busy' | 'ready' | 'error'
  text: string
}

const count = (value: number): string => value.toLocaleString('en-US')

export function indexSummary(status: IndexerStatus, timeZone?: string): IndexSummary {
  if (status.phase === 'walking') return { state: 'busy', text: 'Scanning the folder.' }
  if (status.phase === 'indexing') {
    return {
      state: 'busy',
      text: `Indexing ${count(status.filesDone)} of ${count(status.filesTotal)} files.`
    }
  }
  if (status.phase === 'error') {
    return { state: 'error', text: status.error ?? 'Indexing failed.' }
  }
  if (status.filesTotal === 0) return { state: 'none', text: '' }

  const size = `Indexed ${count(status.filesTotal)} files, ${count(status.chunksTotal)} chunks.`
  return {
    state: 'ready',
    text: status.lastIndexedAt
      ? `Local data last indexed ${formatIndexedAt(status.lastIndexedAt, timeZone)}. ${size}`
      : size
  }
}
