/**
 * The typefaces a reader can choose for Ryte. The names in each stack are the families bundled
 * with the app (nothing is fetched from a network); the system faces after them are the fallback
 * while a face loads and the whole stack for "System Default".
 */
export type FontId =
  | 'geist'
  | 'system'
  | 'cascadia'
  | 'dm'
  | 'google-sans'
  | 'ibm-plex'
  | 'jetbrains'
  | 'lora'
  | 'merriweather'
  | 'noto-sans'
  | 'raleway'
  | 'reddit'
  | 'roboto'
  | 'ubuntu'
  | 'work-sans'

export interface FontOption {
  id: FontId
  /** The name shown in the picker. */
  label: string
  /** Text stack: the interface and the notes. */
  sans: string
  /** Code stack: the family's own mono where it has one, otherwise Geist Mono. */
  mono: string
}

export const DEFAULT_FONT_ID: FontId = 'geist'

const SYSTEM_MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
const FALLBACK_SANS = 'ui-sans-serif, system-ui, sans-serif'
const FALLBACK_SERIF = 'ui-serif, Georgia, serif'

const GEIST_MONO = `'Geist Mono Variable', ${SYSTEM_MONO}`

/** Geist first as the default, System Default second, then the rest alphabetically. */
export const FONT_OPTIONS: readonly FontOption[] = [
  {
    id: 'geist',
    label: 'Geist (Default)',
    sans: `'Geist Variable', ${FALLBACK_SANS}`,
    mono: GEIST_MONO
  },
  {
    id: 'system',
    label: 'System Default',
    sans: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    mono: SYSTEM_MONO
  },
  {
    id: 'cascadia',
    label: 'Cascadia',
    sans: `'Cascadia Mono Variable', ${SYSTEM_MONO}`,
    mono: `'Cascadia Mono Variable', ${SYSTEM_MONO}`
  },
  {
    id: 'dm',
    label: 'DM',
    sans: `'DM Sans Variable', ${FALLBACK_SANS}`,
    mono: `'DM Mono', ${SYSTEM_MONO}`
  },
  {
    id: 'google-sans',
    label: 'Google Sans',
    sans: `'Google Sans Variable', ${FALLBACK_SANS}`,
    mono: `'Google Sans Code Variable', ${SYSTEM_MONO}`
  },
  {
    id: 'ibm-plex',
    label: 'IBM Plex',
    sans: `'IBM Plex Sans Variable', ${FALLBACK_SANS}`,
    mono: `'IBM Plex Mono', ${SYSTEM_MONO}`
  },
  {
    id: 'jetbrains',
    label: 'JetBrains',
    sans: `'JetBrains Mono Variable', ${SYSTEM_MONO}`,
    mono: `'JetBrains Mono Variable', ${SYSTEM_MONO}`
  },
  { id: 'lora', label: 'Lora', sans: `'Lora Variable', ${FALLBACK_SERIF}`, mono: GEIST_MONO },
  {
    id: 'merriweather',
    label: 'Merriweather',
    sans: `'Merriweather Variable', ${FALLBACK_SERIF}`,
    mono: GEIST_MONO
  },
  {
    id: 'noto-sans',
    label: 'Noto Sans',
    sans: `'Noto Sans Variable', ${FALLBACK_SANS}`,
    mono: `'Noto Sans Mono Variable', ${SYSTEM_MONO}`
  },
  {
    id: 'raleway',
    label: 'Raleway',
    sans: `'Raleway Variable', ${FALLBACK_SANS}`,
    mono: GEIST_MONO
  },
  {
    id: 'reddit',
    label: 'Reddit',
    sans: `'Reddit Sans Variable', ${FALLBACK_SANS}`,
    mono: `'Reddit Mono Variable', ${SYSTEM_MONO}`
  },
  {
    id: 'roboto',
    label: 'Roboto',
    sans: `'Roboto Variable', ${FALLBACK_SANS}`,
    mono: `'Roboto Mono Variable', ${SYSTEM_MONO}`
  },
  {
    id: 'ubuntu',
    label: 'Ubuntu',
    sans: `'Ubuntu Sans Variable', ${FALLBACK_SANS}`,
    mono: `'Ubuntu Sans Mono Variable', ${SYSTEM_MONO}`
  },
  {
    id: 'work-sans',
    label: 'Work Sans',
    sans: `'Work Sans Variable', ${FALLBACK_SANS}`,
    mono: GEIST_MONO
  }
]

const FONT_IDS: ReadonlySet<string> = new Set(FONT_OPTIONS.map((font) => font.id))

export function isFontId(value: unknown): value is FontId {
  return typeof value === 'string' && FONT_IDS.has(value)
}

export function fontStacks(id: FontId): { sans: string; mono: string } {
  const font = FONT_OPTIONS.find((option) => option.id === id) ?? FONT_OPTIONS[0]!
  return { sans: font.sans, mono: font.mono }
}
