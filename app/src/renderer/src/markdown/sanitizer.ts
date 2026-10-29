const SAFE_LINK_PROTOCOLS = new Set(['https:', 'mailto:'])

const UNSAFE_ATTRIBUTE_RE = /\s(?:on[a-z]+|srcdoc)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi
const URL_ATTRIBUTE_RE = /\s(href|src)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function encodeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function isSafeLinkTarget(rawTarget: string): boolean {
  const target = decodeHtmlAttribute(rawTarget).trim()
  if (!target) return false
  if (target.startsWith('#')) return true

  try {
    const parsed = new URL(target)
    return SAFE_LINK_PROTOCOLS.has(parsed.protocol)
  } catch {
    return false
  }
}

export function sanitizeRenderedHtml(html: string): string {
  return html
    .replace(UNSAFE_ATTRIBUTE_RE, '')
    .replace(URL_ATTRIBUTE_RE, (_match, attr: string, quoted: string) => {
      const rawTarget = quoted.slice(0, 1).match(/['"]/) ? quoted.slice(1, -1) : quoted
      if (!isSafeLinkTarget(rawTarget)) return ''
      return ` ${attr}="${encodeHtmlAttribute(decodeHtmlAttribute(rawTarget).trim())}"`
    })
}
