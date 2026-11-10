import { parseNoteFileUrl } from '../../../shared/note-pictures'
import { isSupportedNoteVideo } from '../../../shared/note-videos'

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

/** A picture in the notes folder. Allowed on `img src` only, never on links or other tags; a video's `src` is handled by `sanitizeVideoTag`. */
function isNotePictureSource(tagName: string, attributeName: string, rawTarget: string): boolean {
  return (
    tagName === 'img' &&
    attributeName === 'src' &&
    parseNoteFileUrl(decodeHtmlAttribute(rawTarget).trim()) !== null
  )
}

/** A video in the notes folder: a `ryte-file` address with a video extension. Allowed on `video src` only. */
function noteVideoSource(rawTarget: string): string | null {
  const target = decodeHtmlAttribute(rawTarget).trim()
  const path = parseNoteFileUrl(target)
  return path !== null && isSupportedNoteVideo(path) ? target : null
}

/**
 * A `<video>` keeps only a notes-folder `src`. It always gets the standard controls and `preload="metadata"`,
 * so it never loads more than its first frame until it is played, and it can't play by itself: `autoplay`,
 * `loop`, `muted`, `poster`, event handlers and every other attribute are dropped.
 */
function sanitizeVideoTag(attributes: string): string {
  let src: string | null = null
  for (const match of attributes.matchAll(ATTRIBUTE_RE)) {
    const [, , rawName, , rawValue] = match
    if (rawName!.toLowerCase() === 'src' && rawValue !== undefined) {
      src = noteVideoSource(unquote(rawValue))
    }
  }
  const srcAttribute = src === null ? '' : ` src="${encodeHtmlAttribute(src)}"`
  return `<video${srcAttribute} controls preload="metadata">`
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
  return html.replace(START_TAG_RE, (_match, tagName: string, attributes: string) => {
    const name = tagName.toLowerCase()
    // A video's own sources and subtitle tracks could point anywhere; only its `src` is kept.
    if (name === 'source' || name === 'track') return ''
    if (name === 'video') return sanitizeVideoTag(attributes)
    return `<${tagName}${sanitizeAttributes(name, attributes)}>`
  })
}
