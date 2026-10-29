/**
 * The props of StText, and how they become `data-st-*` attributes. A kind and size pick one of the
 * type tokens (`--st-type-<role>-<size>`), a tone picks a text or status color, and weight, lines,
 * and align adjust it. `text.css` (generated from these lists) holds one rule per value.
 */

export const TEXT_ROLES = {
  caption: ['sm', 'md'],
  body: ['sm', 'compact', 'md', 'lg', 'xl'],
  label: ['sm', 'md', 'lg'],
  headline: ['sm', 'md', 'lg', 'xl'],
  code: ['sm', 'md', 'lg']
} as const

export type TextRole = keyof typeof TEXT_ROLES
export type TextSize = (typeof TEXT_ROLES)[TextRole][number]

/** Tones that are text colors (`--st-color-text-*`), then status and action colors (`--st-color-*`). */
export const TEXT_TONES = [
  'strong',
  'primary',
  'secondary',
  'tertiary',
  'muted',
  'contrast',
  'on-primary',
  'link',
  'link-strong',
  'accent',
  'danger',
  'success',
  'warning',
  'info'
] as const

export type TextTone = (typeof TEXT_TONES)[number]

const TEXT_COLOR_TONES = new Set<TextTone>([
  'strong',
  'primary',
  'secondary',
  'tertiary',
  'muted',
  'contrast',
  'on-primary'
])

export const TEXT_WEIGHTS = ['normal', 'medium', 'semi-bold', 'bold'] as const
export const TEXT_ALIGN = ['start', 'center', 'end'] as const
export const TEXT_LINES = [2, 3, 4, 5, 6] as const

export interface TextProps {
  /** The kind of text, which picks the type role. Default `body`. Not `role`, which is the ARIA attribute. */
  kind?: TextRole
  /** Default `md`. A size the role does not offer falls back to `md`. */
  size?: TextSize
  tone?: TextTone
  /** Overrides the weight of the role. */
  weight?: (typeof TEXT_WEIGHTS)[number]
  /** One line, cut with an ellipsis. */
  truncate?: boolean
  /** Clamp to this many lines. */
  lines?: (typeof TEXT_LINES)[number]
  align?: (typeof TEXT_ALIGN)[number]
}

/** The semantic color token a tone reads. */
export function toneToken(tone: TextTone): string {
  return TEXT_COLOR_TONES.has(tone) ? `--st-color-text-${tone}` : `--st-color-${tone}`
}

/** The `<role>-<size>` a role and size resolve to. */
export function resolveTextType(role: TextRole = 'body', size: TextSize = 'md'): string {
  const sizes = TEXT_ROLES[role] as readonly string[]
  return `${role}-${sizes.includes(size) ? size : 'md'}`
}

export function textAttributes(props: TextProps): Record<string, string> {
  const out: Record<string, string> = { 'data-st-type': resolveTextType(props.kind, props.size) }
  if (props.tone) out['data-st-tone'] = props.tone
  if (props.weight) out['data-st-weight'] = props.weight
  if (props.truncate) out['data-st-truncate'] = ''
  if (props.lines) out['data-st-lines'] = String(props.lines)
  if (props.align) out['data-st-align'] = props.align
  return out
}
