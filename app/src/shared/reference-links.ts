/** Where ticket keys and pull request numbers in a summary's timeline lead, set by the user. */
export interface ReferenceLinkBases {
  /** Ends where the ticket key goes, such as "https://company.atlassian.net/browse/". */
  ticket: string
  /** Ends where the pull request number goes, such as "https://github.com/org/repo/pull/". */
  pullRequest: string
}

const MAX_BASE_LENGTH = 300
const TICKET = /^[A-Z][A-Z0-9]*-\d+$/
const PULL_REQUEST = /^(?:PR\s*#?|#)(\d+)$/

/** An empty base switches linking off; otherwise it must be a plain https address. */
export function isReferenceLinkBase(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value === '') return true
  if (value.length > MAX_BASE_LENGTH || /\s/.test(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.username === '' && url.password === ''
  } catch {
    return false
  }
}

function join(base: string, tail: string): string | null {
  if (!isReferenceLinkBase(base) || base === '') return null
  const url = new URL(base.endsWith('/') ? base : `${base}/`)
  url.pathname += tail
  return url.href
}

// The page itself, or one of the tabs of a pull request that a copied address often ends in.
const GITHUB_PATH =
  /^\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/(pull|issues)\/(\d{1,9})(?:\/(?:files|commits|checks))?\/?$/
const ATLASSIAN_HOST = /^([a-z0-9-]+)\.atlassian\.net$/
const ATLASSIAN_PATH = /^\/browse\/([A-Z][A-Z0-9]*-\d+)$/

interface FullAddress {
  /** The address to open, rebuilt from its parts so a query or fragment never rides along. */
  href: string
  /** What the reference reads as: "owner/repo#12" or "tenant/DDT-1234". */
  label: string
}

/**
 * A full address the model copied from a note. Only GitHub pull requests and issues and Atlassian
 * Cloud tickets are recognised, on their exact host with no port or credentials, because the text
 * comes from a model reading untrusted notes and must not send a click anywhere else.
 */
function fullAddress(text: string): FullAddress | null {
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  if (url.hostname === 'github.com') {
    const match = GITHUB_PATH.exec(url.pathname)
    if (!match) return null
    return {
      href: `https://github.com/${match[1]}/${match[2]}/${match[3]}/${match[4]}`,
      label: `${match[1]}/${match[2]}#${match[4]}`
    }
  }
  const tenant = ATLASSIAN_HOST.exec(url.hostname)
  if (tenant) {
    const match = ATLASSIAN_PATH.exec(url.pathname)
    if (!match) return null
    // Any tenant links, so the label names whose it is rather than only the key.
    return { href: `https://${url.hostname}${url.pathname}`, label: `${tenant[1]}/${match[1]}` }
  }
  return null
}

/** True for text that is a web address, whether or not it can be linked. */
export function isWebAddress(text: string): boolean {
  return /^https:\/\/[^\s,;()]+$/.test(text)
}

/** How a reference is shown: a recognised address by what it points to, any other by its host. */
export function referenceLabel(reference: string): string {
  const text = reference.trim()
  if (!isWebAddress(text)) return text
  const address = fullAddress(text)
  if (address) return address.label
  try {
    return new URL(text).hostname
  } catch {
    return text
  }
}

/**
 * The address a reference opens, or null when it cannot be linked. A recognised full address links
 * as it is. A ticket key or pull request number needs its base set in the settings. Only digits and
 * a strict key shape are ever appended to a base, so nothing from the model can change that address.
 */
export function referenceUrl(reference: string, bases: ReferenceLinkBases): string | null {
  const text = reference.trim()
  if (isWebAddress(text)) return fullAddress(text)?.href ?? null
  if (TICKET.test(text)) return join(bases.ticket, text)
  const pullRequest = PULL_REQUEST.exec(text)
  return pullRequest ? join(bases.pullRequest, pullRequest[1]) : null
}
