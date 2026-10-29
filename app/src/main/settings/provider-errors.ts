// Matches OpenAI, Anthropic and masked forms such as "sk-proj-****abcd" or "sk-...abcd".
const KEY_FRAGMENT = /sk-[A-Za-z0-9_*.-]{4,}/g
const REDACTED = '[redacted key]'

/**
 * Providers echo a masked copy of a rejected key back in their error text. That text is shown in
 * the UI, so anything key-shaped, and the exact saved key, is removed while the rest of the message
 * stays useful (for example "model does not exist").
 */
export function redactKeyFragments(message: string, apiKey?: string | null): string {
  const exact = apiKey && apiKey.length >= 8 ? message.split(apiKey).join(REDACTED) : message
  return exact.replace(KEY_FRAGMENT, REDACTED)
}

export function describeProviderError(error: unknown, apiKey?: string | null): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return message ? redactKeyFragments(message, apiKey) : 'The provider returned an error.'
}
