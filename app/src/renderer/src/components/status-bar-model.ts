import type { IndexerStatus } from '../../../preload'

export type StatusBarTone = 'idle' | 'busy' | 'ready' | 'error'

export interface StatusBarInput {
  workspaceError: string | null
  index: IndexerStatus
  /** Whether the index message is still on show; it fades a few seconds after the index is ready. */
  localVisible: boolean
  /** The short smart search text, or null when there is none to show. */
  smartText: string | null
  smartRunning: boolean
}

export interface StatusBarView {
  message: string
  tone: StatusBarTone
  visible: boolean
}

/** The index message alone: what the bar said before smart search was added to it. */
export function indexMessage(workspaceError: string | null, index: IndexerStatus): string {
  if (workspaceError) return `Workspace error: ${workspaceError}`
  switch (index.phase) {
    case 'walking':
      return 'Walking notes…'
    case 'indexing': {
      const total = index.chunksTotal || '?'
      return `Indexing ${index.chunksDone}/${total} chunks · ${index.filesDone}/${index.filesTotal} files`
    }
    case 'done':
      if (index.chunksTotal === 0 && index.filesTotal === 0) return ''
      return `Index ready: ${index.chunksTotal} chunks across ${index.filesTotal} files`
    case 'error':
      return `Indexing error: ${index.error ?? 'unknown'}`
    default:
      return ''
  }
}

function indexTone(index: IndexerStatus): StatusBarTone {
  switch (index.phase) {
    case 'indexing':
    case 'walking':
      return 'busy'
    case 'error':
      return 'error'
    case 'done':
      return 'ready'
    default:
      return 'idle'
  }
}

/**
 * What the status bar says. Smart search shows beside the index message, never in place of one, because it is its own, slower,
 * background job. An index message that has faded away is not repeated beside it, and the bar stays open for smart search alone.
 */
export function statusBarView(input: StatusBarInput): StatusBarView {
  const { workspaceError, index, localVisible, smartText, smartRunning } = input
  const local = indexMessage(workspaceError, index)
  const visible = Boolean(workspaceError) || localVisible || Boolean(smartText)
  if (workspaceError) return { message: local, tone: 'error', visible }

  const localShown = localVisible ? local : ''
  if (!smartText) return { message: local, tone: indexTone(index), visible }
  if (!localShown) {
    // With nothing else to say, working is shown as busy and a pause quietly.
    return { message: smartText, tone: smartRunning ? 'busy' : 'idle', visible }
  }
  return { message: `${localShown} · ${smartText}`, tone: indexTone(index), visible }
}
