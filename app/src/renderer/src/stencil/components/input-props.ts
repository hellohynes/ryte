/**
 * The props of StInput, and how they become `data-st-*` attributes. One component covers a boxed
 * field (Preferences), an inline edit that takes the font of the text it replaces (renaming a file),
 * and a bare field with no chrome (the search box). `input.css` is generated from these lists.
 */

export const INPUT_VARIANTS = ['boxed', 'inline', 'bare'] as const
/** Sizes use the body type role of the same name. The inline variant ignores size and inherits. */
export const INPUT_SIZES = ['md', 'lg'] as const
export const INPUT_TYPES = ['text', 'password', 'search', 'email', 'url'] as const

export type InputVariant = (typeof INPUT_VARIANTS)[number]
export type InputSize = (typeof INPUT_SIZES)[number]

export interface InputProps {
  /** Default `boxed`. */
  variant?: InputVariant
  /** Default `md`. */
  size?: InputSize
  /** Default `text`. */
  type?: (typeof INPUT_TYPES)[number]
  /** Marks the value as wrong: a danger border and `aria-invalid`. */
  invalid?: boolean
}

export function inputAttributes(props: InputProps): Record<string, string> {
  const out: Record<string, string> = {
    'data-st-variant': props.variant ?? 'boxed',
    'data-st-size': props.size ?? 'md',
    type: props.type ?? 'text'
  }
  if (props.invalid) {
    out['data-st-invalid'] = ''
    out['aria-invalid'] = 'true'
  }
  return out
}
