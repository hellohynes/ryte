import { NOTE_FILE_SCHEME } from '../../shared/note-pictures'
import { isHtmlPagePath, pageUrl, parsePageUrl } from '../../shared/page-box'

/**
 * Whether a frame inside a page may load this address. The page is a browser tab, so a frame may load the web;
 * it may not load Ryte's own surfaces: local files, the notes through `ryte-file`, or the app's own window.
 */
export function isSubframeAllowed(url: string): boolean {
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return false
  }
  if (target.protocol === 'file:' || target.protocol === `${NOTE_FILE_SCHEME}:`) return false
  const appUrl = process.env['ELECTRON_RENDERER_URL']
  return !appUrl || target.origin !== new URL(appUrl).origin
}

/**
 * What a page moving to another address of its own does. `true`: it may go there. A string: it may go to that
 * address instead, the same page under the token of its own folder, so its saved data follows the folder.
 * `false`: it is not a move to an HTML page of the notes folder.
 */
export function pageMoveVerdict(
  url: string,
  tokenOfFolder: (notesRelativeFile: string) => string | null
): boolean | string {
  const parsed = parsePageUrl(url)
  if (!parsed || !isHtmlPagePath(parsed.path)) return false
  const token = tokenOfFolder(parsed.path)
  if (token === null) return false
  if (token === parsed.token) return true
  const { search, hash } = new URL(url)
  return pageUrl(token, parsed.path) + search + hash
}
