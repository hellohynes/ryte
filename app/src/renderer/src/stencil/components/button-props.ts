/**
 * The props of StButton and StIconButton, and how they become `data-st-*` attributes.
 * `button.css` (generated from these lists) holds one rule per variant and size, each reading tokens.
 */

export const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'link', 'danger'] as const
/** Sizes of a text button. Each uses the label type role of the same size. */
export const BUTTON_SIZES = ['sm', 'md', 'lg'] as const

/** Icon buttons are squares: a block token for the box and the icon size inside it. */
export const ICON_BUTTON_SIZES = {
  sm: { block: 300, icon: 14 },
  md: { block: 350, icon: 14 },
  lg: { block: 400, icon: 16 }
} as const

export type ButtonVariant = (typeof BUTTON_VARIANTS)[number]
export type ButtonSize = (typeof BUTTON_SIZES)[number]

export interface ButtonProps {
  /** Default `secondary`. */
  variant?: ButtonVariant
  /** Default `md`. */
  size?: ButtonSize
  disabled?: boolean
  /** Disables the button and marks it busy. */
  loading?: boolean
}

export interface IconButtonProps {
  /** Default `ghost`. */
  variant?: Exclude<ButtonVariant, 'link'>
  /** Default `md`. */
  size?: ButtonSize
  disabled?: boolean
}

type Attributes = Record<string, string>

export function buttonAttributes(props: ButtonProps): Attributes {
  const out: Attributes = {
    'data-st-variant': props.variant ?? 'secondary',
    'data-st-size': props.size ?? 'md'
  }
  if (props.loading) {
    out['data-st-loading'] = ''
    out['aria-busy'] = 'true'
  }
  if (props.disabled || props.loading) out.disabled = ''
  return out
}

export function iconButtonAttributes(props: IconButtonProps): Attributes {
  const out: Attributes = {
    'data-st-variant': props.variant ?? 'ghost',
    'data-st-size': props.size ?? 'md'
  }
  if (props.disabled) out.disabled = ''
  return out
}
