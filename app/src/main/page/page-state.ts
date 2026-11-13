import { z } from 'zod'

// Far past any real page, so a page that reports a huge number cannot make the restore script absurd.
const MAX_SCROLL = 10_000_000
const MAX_AREAS = 20
/** What is kept for one page, in bytes of its JSON. The capture script stops adding fields at this size. */
export const MAX_STATE_BYTES = 256 * 1024
// Room for the path, the window scroll and the scrolled areas, which the capture script does not count.
const RESERVED_BYTES = 20 * 1024

const scrollNumber = z
  .number()
  .finite()
  .transform((n) => Math.min(Math.max(Math.round(n), 0), MAX_SCROLL))

// An element is found again by `#id` (when the id was unique) or by a tag and position path from the root. The
// pattern only holds keys to those two shapes: it is the JSON encoding of the state, not this pattern, that keeps
// a page's text from becoming code in the restore script.
const key = z
  .string()
  .max(300)
  .regex(/^(#.+|[a-z0-9-]+\[\d{1,5}\](\/[a-z0-9-]+\[\d{1,5}\])*)$/s)

const TEXT_KINDS = [
  'textarea',
  'select-one',
  'input-text',
  'input-search',
  'input-url',
  'input-tel',
  'input-email',
  'input-number',
  'input-date',
  'input-datetime-local',
  'input-month',
  'input-week',
  'input-time',
  'input-range',
  'input-color'
] as [string, ...string[]]
const TICK_KINDS = ['input-checkbox', 'input-radio'] as const

// Only these kinds are ever read or written. Password, hidden and file inputs are not among them, so a page that
// lies about one gets it dropped here, and the restore script would not touch it anyway.
const field = z.union([
  z.object({ key, kind: z.enum(TEXT_KINDS), value: z.string() }),
  z.object({ key, kind: z.enum(TICK_KINDS), value: z.boolean() })
])
const area = z.object({ key, x: scrollNumber, y: scrollNumber })

export type PageField = z.infer<typeof field>

/** What a page was showing: where it was scrolled to, and what was typed or picked in it. */
export interface PageState {
  path: string
  scroll: { x: number; y: number }
  areas: z.infer<typeof area>[]
  fields: PageField[]
}

const keepValid = <T>(schema: z.ZodType<T>, items: unknown): T[] =>
  (Array.isArray(items) ? items : []).flatMap((item) => {
    const parsed = schema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })

/**
 * The page's reply is untrusted: whatever does not fit the schema is dropped, numbers are clamped, and a reply
 * over the cap is refused (the capture script keeps its own replies under it).
 */
export function parsePageState(reply: unknown): PageState | null {
  if (typeof reply !== 'object' || reply === null) return null
  const raw = reply as Record<string, unknown>
  const scroll = z.object({ x: scrollNumber, y: scrollNumber }).safeParse(raw['scroll'])
  const path = z.string().max(2048).safeParse(raw['path'])
  if (!scroll.success || !path.success) return null
  const state: PageState = {
    path: path.data,
    scroll: scroll.data,
    areas: keepValid(area, Array.isArray(raw['areas']) ? raw['areas'].slice(0, MAX_AREAS) : []),
    fields: keepValid(field, raw['fields'])
  }
  return Buffer.byteLength(JSON.stringify(state)) > MAX_STATE_BYTES ? null : state
}

/** True when nothing needs putting back: the page is at the top and has no typed or picked values. */
export const isEmptyState = (state: PageState): boolean =>
  state.scroll.x === 0 &&
  state.scroll.y === 0 &&
  state.areas.length === 0 &&
  state.fields.length === 0

// Shared by both scripts: the kind of an element (empty for what is not kept) and whether it still has the
// value the page gave it.
const ELEMENT_HELPERS = `
  const kindOf = (el) =>
    el.tagName === 'TEXTAREA' ? 'textarea'
    : el.tagName === 'SELECT' ? (el.multiple ? '' : 'select-one')
    : el.tagName === 'INPUT' ? 'input-' + el.type : ''
  const atDefault = (el) => {
    if (el.tagName === 'SELECT') {
      const first = [...el.options].find((o) => o.defaultSelected) || el.options[0]
      return !first || el.value === first.value
    }
    return el.type === 'checkbox' || el.type === 'radio' ? el.checked === el.defaultChecked : el.value === el.defaultValue
  }`

/**
 * Asks a page what it shows. It runs in its own isolated world, so it does not depend on the page's own code and
 * the page cannot see it. Only values that differ from the page's own defaults are read, and never a password,
 * hidden or file input, an input that asks for a password or one-time code, or an input that has ever been a
 * password (a "show password" button turns one into text).
 */
export const CAPTURE_SCRIPT = `(() => {${ELEMENT_HELPERS}
  const seen = (globalThis.rytePasswordInputs ??= new WeakSet())
  for (const el of document.querySelectorAll('input[type=password]')) seen.add(el)
  const ids = new Map()
  const all = document.getElementsByTagName('*')
  for (const e of all) if (e.id) ids.set(e.id, (ids.get(e.id) || 0) + 1)
  const keyOf = (el) => {
    if (el.id && ids.get(el.id) === 1) return '#' + el.id
    const parts = []
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      let i = 1
      for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === n.tagName) i += 1
      parts.unshift(n.tagName.toLowerCase() + '[' + i + ']')
    }
    return parts.join('/')
  }
  const kinds = ${JSON.stringify([...TEXT_KINDS, ...TICK_KINDS])}
  const encoder = new TextEncoder()
  let room = ${MAX_STATE_BYTES - RESERVED_BYTES}
  const fields = []
  for (const el of document.querySelectorAll('input,textarea,select')) {
    const kind = kindOf(el)
    if (!kinds.includes(kind) || seen.has(el) || /password|one-time-code/i.test(el.autocomplete) || atDefault(el)) continue
    const f = { key: keyOf(el), kind, value: kind === 'input-checkbox' || kind === 'input-radio' ? el.checked : el.value }
    const size = encoder.encode(JSON.stringify(f)).length + 1
    if (size > room) continue
    room -= size
    fields.push(f)
  }
  const scrolled = []
  for (const el of all) {
    if ((el.scrollTop || el.scrollLeft) && el !== document.body && el !== document.documentElement) scrolled.push(el)
  }
  scrolled.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)
  const areas = scrolled.slice(0, ${MAX_AREAS}).map((el) => ({ key: keyOf(el), x: el.scrollLeft, y: el.scrollTop }))
  return { path: location.pathname, scroll: { x: window.scrollX, y: window.scrollY }, areas, fields }
})()`

/** The world the capture and restore scripts run in. Any number above Electron's own (999) is free. */
export const STATE_WORLD_ID = 1234

/**
 * The script that puts a page back as it was. The state is JSON-encoded into it, so no text from the page is ever
 * spliced into code. It does nothing on another path, skips an element that is missing or no longer the same
 * kind, and fires `input` and `change` so the page notices. The second pass, for pages that render late, leaves
 * alone whatever the person has already changed or scrolled.
 */
export function restoreScript(state: PageState, secondPass = false): string {
  return `((s, secondPass) => {${ELEMENT_HELPERS}
  if (location.pathname !== s.path) return
  const find = (key) => {
    if (key[0] === '#') return document.getElementById(key.slice(1))
    let node = document.documentElement
    for (const seg of key.split('/')) {
      const m = /^([a-z0-9-]+)\\[(\\d+)\\]$/.exec(seg)
      if (!m) return null
      let left = +m[2]
      let next = null
      for (const c of node.children) if (c.tagName.toLowerCase() === m[1] && --left === 0) { next = c; break }
      if (!next) return null
      node = next
    }
    return node
  }
  const fire = (el) => { for (const type of ['input', 'change']) el.dispatchEvent(new Event(type, { bubbles: true })) }
  for (const f of s.fields) {
    const el = find(f.key)
    if (!el || kindOf(el) !== f.kind || (secondPass && !atDefault(el))) continue
    if (f.kind === 'input-checkbox' || f.kind === 'input-radio') {
      if (el.checked !== f.value) { el.checked = f.value; fire(el) }
    } else if (el.value !== f.value) {
      el.value = f.value
      fire(el)
    }
  }
  for (const a of s.areas) {
    const el = find(a.key)
    if (el && !(secondPass && (el.scrollTop || el.scrollLeft))) { el.scrollLeft = a.x; el.scrollTop = a.y }
  }
  if (!(secondPass && (window.scrollX || window.scrollY))) window.scrollTo({ left: s.scroll.x, top: s.scroll.y, behavior: 'instant' })
})(${JSON.stringify(state)}, ${secondPass})`
}
