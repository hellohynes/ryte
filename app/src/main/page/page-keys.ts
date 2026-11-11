import type { AppMenuCommand } from '../../contract/app'

export interface PageKeyInput {
  key: string
  meta: boolean
  control: boolean
  alt: boolean
  shift: boolean
}

/** What Ryte does with a key the page would otherwise swallow: a menu command, or a key sent to the app window. */
export type AppKey =
  | { kind: 'command'; command: AppMenuCommand }
  | { kind: 'key'; key: string; modifiers: ('meta' | 'control')[] }

const CONTROL_KEYS: ReadonlySet<string> = new Set(['0', '/', 't', 'o'])

/**
 * Ryte's own shortcuts. A page with focus must not be able to take them (a script can cancel a key it sees), so
 * the view hands them to the app before the page gets them. Everything else goes to the page.
 */
export function appKeyFor(input: PageKeyInput, platform: NodeJS.Platform): AppKey | null {
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key
  // macOS keeps a few shortcuts on Control (zoom reset, shortcuts help, new tab, open), which the app window
  // handles as keys.
  if (
    platform === 'darwin' &&
    input.control &&
    !input.meta &&
    !input.alt &&
    !input.shift &&
    CONTROL_KEYS.has(key)
  ) {
    return { kind: 'key', key, modifiers: ['control'] }
  }
  const command =
    platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta
  if (!command) return null
  const modifiers: ('meta' | 'control')[] = [platform === 'darwin' ? 'meta' : 'control']

  if (input.alt) return key === 'w' && !input.shift ? menu('close-all-tabs') : null
  if (input.shift) {
    if (key === ']' || key === '}') return menu('focus-next-tab')
    if (key === '[' || key === '{') return menu('focus-previous-tab')
    return null
  }
  switch (key) {
    case 'w':
      return menu('close-active-tab')
    case 'o':
      return menu('open-native-file')
    case 'b':
      return menu('toggle-sidebar')
    case 'e':
      return menu('toggle-source-mode')
    case ',':
      return menu('open-settings')
    case 'k':
    case 'p':
      return { kind: 'key', key, modifiers }
    default:
      // Go to tab 1 to 9.
      return /^[1-9]$/.test(key) ? { kind: 'key', key, modifiers } : null
  }
}

function menu(
  type: Exclude<AppMenuCommand['type'], 'open-source-path' | 'open-recent-file'>
): AppKey {
  return { kind: 'command', command: { type } }
}
