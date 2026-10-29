import type { DataFlowAcknowledgement, ProviderId } from '../../main/settings/settings-store'

export function acknowledgementMatches(
  acknowledgement: DataFlowAcknowledgement | null,
  provider: ProviderId,
  model: string
): boolean {
  return acknowledgement?.provider === provider && acknowledgement.model === model
}

/**
 * IPC cannot clone Vue's reactive proxies, so settings saves must use a fresh
 * plain acknowledgement object even when the saved acknowledgement is current.
 */
export function acknowledgementForSave(
  acknowledgement: DataFlowAcknowledgement | null,
  provider: ProviderId,
  model: string,
  now: () => string = () => new Date().toISOString()
): DataFlowAcknowledgement {
  if (acknowledgement && acknowledgementMatches(acknowledgement, provider, model)) {
    return {
      acknowledgedAt: acknowledgement.acknowledgedAt,
      provider: acknowledgement.provider,
      model: acknowledgement.model
    }
  }
  return { acknowledgedAt: now(), provider, model }
}
