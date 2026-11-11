import { parseLocalAddress } from '../../shared/local-address'

const WEB_SOCKET_FOR: Readonly<Record<string, string>> = { 'http:': 'ws:', 'https:': 'wss:' }

/**
 * Whether the locked view of an approved origin may make this request. Only that origin's own `http(s)` address and
 * its `ws(s)` connection (live reload) pass: another port, another spelling of this Mac (`127.0.0.1` for a
 * `localhost` approval), any internet host and Ryte's own schemes do not. A redirect is a new request, so its
 * target is judged here too.
 */
export function isAllowedLocalRequest(url: string, origin: string): boolean {
  const approved = parseLocalAddress(origin)
  if (!approved) return false
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return false
  }
  const sameScheme =
    target.protocol === `${approved.scheme}:` ||
    target.protocol === WEB_SOCKET_FOR[`${approved.scheme}:`]
  if (!sameScheme || target.username !== '' || target.password !== '') return false
  const port = target.port === '' ? defaultPort(target.protocol) : target.port
  return target.hostname === approved.host && port === approved.port
}

function defaultPort(protocol: string): string {
  return protocol === 'https:' || protocol === 'wss:' ? '443' : '80'
}

/** Whether a page of this origin may move to this address: the same origin, any path. */
export function isSameLocalOrigin(url: string, origin: string): boolean {
  return parseLocalAddress(url)?.origin === origin
}
