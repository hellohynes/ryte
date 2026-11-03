import type { EmbeddingStatus } from '../../../contract/indexer'

const count = (value: number): string => value.toLocaleString('en-US')

/** "3:42 PM", in the viewer's time zone unless one is given. */
export function formatRetryTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(new Date(iso))
}

const PAUSE_CAUSE: Record<'offline' | 'rate-limit' | 'service' | 'auth', string> = {
  offline: 'no connection',
  'rate-limit': 'OpenAI asked Ryte to slow down',
  service: 'OpenAI had a problem',
  auth: 'OpenAI refused the key or model'
}

/**
 * The sentence under the index summary in Preferences, or null when there is nothing to say: smart search is off, or main has not
 * said anything yet. `smartSearchOn` is the person's setting; main's state says what became of it.
 */
export function embeddingLine(
  status: EmbeddingStatus | null,
  smartSearchOn: boolean,
  timeZone?: string
): string | null {
  if (!smartSearchOn || status === null) return null

  if (status.state === 'off') {
    if (status.reason === 'no-key') {
      return 'Smart search is on, but there is no OpenAI key. Add one in AI tools.'
    }
    if (status.reason === 'no-agreement') {
      return 'Smart search needs your confirmation. Turn it off and on again in AI tools.'
    }
    return null
  }
  if (status.state === 'running') {
    return `Smart search: adding to ${count(status.done)} of ${count(status.total)} notes.`
  }
  if (status.state === 'paused') {
    const cause = status.reason && status.reason in PAUSE_CAUSE ? status.reason : null
    if (cause === null) return 'Smart search is paused.'
    const base = `Smart search is paused: ${PAUSE_CAUSE[cause as keyof typeof PAUSE_CAUSE]}.`
    if (cause === 'auth') return `${base} Check AI tools.`
    return status.retryAt
      ? `${base} Trying again at ${formatRetryTime(status.retryAt, timeZone)}.`
      : base
  }
  if (status.pending > 0) {
    const notes = status.pending === 1 ? '1 note is' : `${count(status.pending)} notes are`
    return `Smart search is ready. ${notes} searchable by keywords only for now.`
  }
  return 'Smart search is ready.'
}

const CLEAR_AND_REBUILD_CONFIRM =
  "Clear Ryte's local search index and rebuild it from the notes folder?"

/** The confirm before clearing the index. With smart search on it says the notes are sent again, which a rebuild does. */
export function clearAndRebuildConfirm(smartSearchOn: boolean): string {
  return smartSearchOn
    ? `${CLEAR_AND_REBUILD_CONFIRM} Your notes will be sent to OpenAI again to rebuild smart search.`
    : CLEAR_AND_REBUILD_CONFIRM
}
