/** Hosts a local page may be served from. Another name for this Mac, `0.0.0.0` and every other host are not local. */
const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]'])

const DEFAULT_PORTS: Readonly<Record<string, string>> = { 'http:': '80', 'https:': '443' }

export interface LocalAddress {
  scheme: 'http' | 'https'
  host: string
  port: string
  /** Scheme, host and the port always spelled out: `http://localhost:5173`. One approval covers one origin. */
  origin: string
  /** The address as the page loads it, with any path and query kept. */
  url: string
}

/** The longest address the app takes. */
export const MAX_LOCAL_ADDRESS_LENGTH = 2000

/** Reads a full `http:` or `https:` address on this Mac, or returns null when it is anything else. */
export function parseLocalAddress(input: string): LocalAddress | null {
  if (input.length > MAX_LOCAL_ADDRESS_LENGTH) return null
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return null
  }
  const defaultPort = DEFAULT_PORTS[parsed.protocol]
  if (defaultPort === undefined) return null
  if (parsed.username !== '' || parsed.password !== '') return null
  if (!LOCAL_HOSTS.has(parsed.hostname)) return null
  const port = parsed.port === '' ? defaultPort : parsed.port
  const scheme = parsed.protocol === 'https:' ? 'https' : 'http'
  return {
    scheme,
    host: parsed.hostname,
    port,
    origin: `${scheme}://${parsed.hostname}:${port}`,
    url: parsed.href
  }
}

/**
 * Reads what a person typed: a full address, or a bare `localhost:5173` or `127.0.0.1:3000/path`, which is taken as
 * `http:`. Null when it is not a local address.
 */
export function parseTypedLocalAddress(typed: string): LocalAddress | null {
  const text = typed.trim()
  if (text === '' || /\s/.test(text)) return null
  return parseLocalAddress(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`)
}

/** `localhost:5173`: an origin as the prompt and the list show it. */
export function describeOrigin(origin: string): string {
  return origin.replace(/^https?:\/\//, '')
}
