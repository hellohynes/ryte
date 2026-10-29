/**
 * The props of StNotice, and how they become `data-st-*` attributes. A notice is a message about
 * the state of something: boxed with a tinted fill and edge, or inline as colored text. The tone
 * reads a semantic color. `notice.css` is generated from these lists.
 */

export const NOTICE_TONES = ['info', 'success', 'warning', 'danger'] as const
export const NOTICE_VARIANTS = ['boxed', 'inline'] as const

export type NoticeTone = (typeof NOTICE_TONES)[number]

export interface NoticeProps {
  /** Default `info`. */
  tone?: NoticeTone
  /** Default `boxed`. */
  variant?: (typeof NOTICE_VARIANTS)[number]
  /** A bold line above the message. */
  title?: string
  /** Shows a close button and emits `dismiss`. */
  dismissible?: boolean
  /** Announce it right away (`alert`) instead of politely (`status`). Danger defaults to urgent. */
  urgent?: boolean
}

export function noticeAttributes(props: NoticeProps): Record<string, string> {
  const tone = props.tone ?? 'info'
  const urgent = props.urgent ?? tone === 'danger'
  return {
    'data-st-tone': tone,
    'data-st-variant': props.variant ?? 'boxed',
    role: urgent ? 'alert' : 'status'
  }
}
