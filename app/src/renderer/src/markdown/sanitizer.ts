import { parseNoteFileUrl } from '../../../shared/note-pictures'

const SAFE_LINK_PROTOCOLS = new Set(['https:', 'mailto:'])

// A start tag, with quoted values allowed to contain `>`. Text between tags is
// already escaped by markdown-it and Shiki, so every `<` here opens a real tag.
// Closing tags and comments carry no attributes and are left alone.
const START_TAG_RE = /<([A-Za-z][A-Za-z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
const ATTRIBUTE_RE = /(\s+)([^\s"'>/=]+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g

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

function unquote(value: string): string {
  const first = value[0]
  return first === '"' || first === "'" ? value.slice(1, -1) : value
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

/** A picture in the notes folder. Allowed on `img src` only, never on links or other tags. */
function isNotePictureSource(tagName: string, attributeName: string, rawTarget: string): boolean {
  return (
    tagName === 'img' &&
    attributeName === 'src' &&
    parseNoteFileUrl(decodeHtmlAttribute(rawTarget).trim()) !== null
  )
}

function sanitizeAttributes(tagName: string, attributes: string): string {
  return attributes.replace(
    ATTRIBUTE_RE,
    (match, space: string, rawName: string, _equals?: string, rawValue?: string) => {
      const name = rawName.toLowerCase()
      if (name.startsWith('on') || name === 'srcdoc') return ''
      if (name !== 'href' && name !== 'src') return match
      if (rawValue === undefined) return ''

      const target = unquote(rawValue)
      if (!isSafeLinkTarget(target) && !isNotePictureSource(tagName, name, target)) return ''
      return `${space}${name}="${encodeHtmlAttribute(decodeHtmlAttribute(target).trim())}"`
    }
  )
}

export function sanitizeRenderedHtml(html: string): string {
  return html.replace(
    START_TAG_RE,
    (_match, tagName: string, attributes: string) =>
      `<${tagName}${sanitizeAttributes(tagName.toLowerCase(), attributes)}>`
  )
}
