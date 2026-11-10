import { isHtmlPagePath, PAGE_SCHEME, parsePageUrl } from '../../shared/page-box'

/** Whether a request is for a file of this page's own folder. Anything else the session cancels. */
export function isOwnPageAddress(url: string, id: string): boolean {
  return url.toLowerCase().startsWith(`${PAGE_SCHEME}://${id}/`)
}

/**
 * Whether a page may move to this address: another HTML page in the folder it was opened from (or a folder
 * inside it), under its own id. Any other folder, other id, other kind of file or other scheme is refused.
 */
export function isOwnPageMove(url: string, id: string): boolean {
  const parsed = parsePageUrl(url)
  return parsed !== null && parsed.id === id && isHtmlPagePath(parsed.path)
}
