import { isHtmlPagePath, PAGE_SCHEME, pageUrl, parsePageUrl } from '../../shared/page-box'

/** Whether an address is a `ryte-page` address, which a frame inside a page may load. */
export const isPageAddress = (url: string): boolean =>
  url.toLowerCase().startsWith(`${PAGE_SCHEME}://`)

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
