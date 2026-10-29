import { nativeTheme } from 'electron'

import type { ColorMode } from './settings/settings-store'

/**
 * Follows the saved color mode in the window itself: with the native theme set, the macOS
 * vibrancy material and the `prefers-color-scheme` the renderer reads both match the choice, and
 * "system" follows the computer's own setting.
 */
export function applyColorMode(mode: ColorMode): void {
  nativeTheme.themeSource = mode
}
