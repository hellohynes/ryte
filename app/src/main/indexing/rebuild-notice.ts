export interface RebuildNotice {
  message: string
  detail: string
}

/**
 * What the person is told once, on the first start after the search index moved to its own file per notes folder and the old one
 * was removed. It says what is happening, what it means for search, and, when notes are about to leave the device for a cloud
 * provider, that too. It carries no path, no note and no key.
 */
export function rebuildNotice({ cloud }: { cloud: boolean }): RebuildNotice {
  const detail = [
    'Ryte changed how it stores its search index, so it is rebuilding it now. Search may be incomplete for a short while. Your notes are not changed.'
  ]
  if (cloud) {
    detail.push(
      'Search works as soon as Ryte has scanned your notes. Because smart search is on, your notes will be sent to OpenAI again so smart search can fill in afterwards. This needs an internet connection. If it fails, search keeps working and Ryte tries again on its own. You can also choose Rebuild index in Preferences, under Content.'
    )
  }
  return { message: 'Ryte is rebuilding its search index', detail: detail.join('\n\n') }
}
