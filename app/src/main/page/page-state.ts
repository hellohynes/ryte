import { z } from 'zod'

// Far past any real page, so a page that reports a huge number cannot make the restore script absurd.
const MAX_SCROLL = 10_000_000
const MAX_AREAS = 20
const MAX_FIELDS = 2000
const MAX_VALUE_CHARS = 65_536
/** A page's kept state is cut down to this, largest values first. */
export const MAX_STATE_BYTES = 256 * 1024

const scrollNumber = z
  .number()
  .finite()
  .transform((n) => Math.min(Math.max(Math.round(n), 0), MAX_SCROLL))

// An element is found again by `#id` (when the id was unique) or by a tag and position path from the root.
// The pattern is also what keeps a page's reply from putting anything else into the restore script.
const key = z
  .string()
  .max(300)
  .regex(/^(#.+|[a-z0-9-]+\[\d{1,5}\](\/[a-z0-9-]+\[\d{1,5}\])*)$/s)

const TEXT_KINDS = [
  'textarea',
  'select-one',
  ...['text', 'search', 'url', 'tel', 'email', 'number', 'date', 'datetime-local'].map(
    (type) => `input-${type}`
  ),
  ...['month', 'week', 'time', 'range', 'color'].map((type) => `input-${type}`)
] as [string, ...string[]]

// Only these kinds are ever read or written. Password, hidden and file inputs are not among them, so a page that
// lies about one gets it dropped here, and the restore script would not touch it anyway.
const field = z.union([
  z.object({ key, kind: z.enum(TEXT_KINDS), value: z.string().max(MAX_VALUE_CHARS) }),
  z.object({ key, kind: z.enum(['input-checkbox', 'input-radio']), value: z.boolean() }),
  z.object({
    key,
    kind: z.literal('select-multiple'),
    value: z.array(z.string().max(1000)).max(1000)
  })
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

const keepValid = <T>(schema: z.ZodType<T>, items: unknown, max: number): T[] =>
  (Array.isArray(items) ? items.slice(0, max) : []).flatMap((item) => {
    const parsed = schema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })

/** The page's reply is untrusted: whatever does not fit the schema is dropped, numbers are clamped, and the whole is capped. */
export function parsePageState(reply: unknown): PageState | null {
  if (typeof reply !== 'object' || reply === null) return null
  const raw = reply as Record<string, unknown>
  const scroll = z.object({ x: scrollNumber, y: scrollNumber }).safeParse(raw['scroll'])
  const path = z.string().max(2048).safeParse(raw['path'])
  if (!scroll.success || !path.success) return null
  const state: PageState = {
    path: path.data,
    scroll: scroll.data,
    areas: keepValid(area, raw['areas'], MAX_AREAS),
    fields: keepValid(field, raw['fields'], MAX_FIELDS)
  }
  // Over the cap: drop the largest field values first.
  let total = JSON.stringify(state).length
  if (total > MAX_STATE_BYTES) {
    const bySize = state.fields
      .map((f) => ({ f, size: JSON.stringify(f).length }))
      .sort((a, b) => b.size - a.size)
    const dropped = new Set<PageField>()
    for (const { f, size } of bySize) {
      if (total <= MAX_STATE_BYTES) break
      dropped.add(f)
      total -= size + 1
    }
    state.fields = state.fields.filter((f) => !dropped.has(f))
  }
  return total > MAX_STATE_BYTES ? null : state
}

/** True when nothing needs putting back: the page is at the top and has no typed or picked values. */
export const isEmptyState = (state: PageState): boolean =>
  state.scroll.x === 0 &&
  state.scroll.y === 0 &&
  state.areas.length === 0 &&
  state.fields.length === 0

/**
 * Asks a page what it shows. It runs in its own isolated world, so it does not depend on the page's own code and
 * the page cannot see it. Only values that differ from the page's own defaults are read, and never a password,
 * hidden or file input.
 */
export const CAPTURE_SCRIPT = `(() => {
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
  const TEXT = ${JSON.stringify(TEXT_KINDS.filter((kind) => kind.startsWith('input-')).map((kind) => kind.slice(6)))}
  const fields = []
  for (const el of document.querySelectorAll('input,textarea,select')) {
    if (fields.length >= ${MAX_FIELDS}) break
    const tag = el.tagName
    let kind, value
    if (tag === 'TEXTAREA') {
      if (el.value !== el.defaultValue) { kind = 'textarea'; value = el.value }
    } else if (tag === 'SELECT') {
      const options = [...el.options]
      const first = options.find((o) => o.defaultSelected) || options[0]
      if (el.multiple ? options.some((o) => o.selected !== o.defaultSelected) : first && el.value !== first.value) {
        kind = el.multiple ? 'select-multiple' : 'select-one'
        value = el.multiple ? options.filter((o) => o.selected).map((o) => o.value) : el.value
      }
    } else if (el.type === 'checkbox' || el.type === 'radio') {
      if (el.checked !== el.defaultChecked) { kind = 'input-' + el.type; value = el.checked }
    } else if (TEXT.includes(el.type) && el.value !== el.defaultValue) {
      kind = 'input-' + el.type; value = el.value
    }
    if (kind !== undefined && !(typeof value === 'string' && value.length > ${MAX_VALUE_CHARS})) {
      fields.push({ key: keyOf(el), kind, value })
    }
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
 * The script that puts a page back as it was. It is built only from a state that `parsePageState` has checked and
 * JSON-encoded, so no text from the page is ever spliced into code. It does nothing on another path, skips an
 * element that is missing or no longer the same kind, and fires `input` and `change` so the page notices.
 */
export function restoreScript(state: PageState): string {
  return `((s) => {
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
  const kindOf = (el) =>
    el.tagName === 'TEXTAREA' ? 'textarea'
    : el.tagName === 'SELECT' ? (el.multiple ? 'select-multiple' : 'select-one')
    : el.tagName === 'INPUT' ? 'input-' + el.type : ''
  const fire = (el) => { for (const type of ['input', 'change']) el.dispatchEvent(new Event(type, { bubbles: true })) }
  for (const f of s.fields) {
    const el = find(f.key)
    if (!el || kindOf(el) !== f.kind) continue
    if (f.kind === 'input-checkbox' || f.kind === 'input-radio') {
      if (el.checked !== f.value) { el.checked = f.value; fire(el) }
    } else if (f.kind === 'select-multiple') {
      let changed = false
      for (const o of el.options) {
        const on = f.value.includes(o.value)
        if (o.selected !== on) { o.selected = on; changed = true }
      }
      if (changed) fire(el)
    } else if (el.value !== f.value) {
      el.value = f.value
      fire(el)
    }
  }
  for (const a of s.areas) {
    const el = find(a.key)
    if (el) { el.scrollLeft = a.x; el.scrollTop = a.y }
  }
  window.scrollTo({ left: s.scroll.x, top: s.scroll.y, behavior: 'instant' })
})(${JSON.stringify(state)})`
}
