import { open } from 'node:fs/promises'

import { extractMarkdownTitle } from '../../shared/markdown-title'

const TITLE_READ_BYTES = 64 * 1024

export async function readMarkdownTitleFromFile(absolutePath: string): Promise<string | null> {
  const handle = await open(absolutePath, 'r')

  try {
    const buffer = Buffer.alloc(TITLE_READ_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    if (bytesRead === 0) return null

    return extractMarkdownTitle(buffer.subarray(0, bytesRead).toString('utf8'))
  } finally {
    await handle.close()
  }
}
