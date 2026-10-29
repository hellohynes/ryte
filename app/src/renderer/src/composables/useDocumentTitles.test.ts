import { computed, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useDocumentTitles } from './useDocumentTitles'

async function flushAsync(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('useDocumentTitles', () => {
  it('hydrates titles for visible source paths', async () => {
    const readSourceTitle = vi.fn(({ sourcePath }: { sourcePath: string }) =>
      Promise.resolve(sourcePath === 'a.md' ? 'Title A' : 'Title B')
    )
    vi.stubGlobal('window', {
      ryte: {
        files: {
          readSourceTitle
        }
      }
    })

    const sourcePaths = ref(['a.md', 'b.md'])
    const titles = useDocumentTitles(sourcePaths)
    await flushAsync()

    expect(titles.value).toEqual({
      'a.md': 'Title A',
      'b.md': 'Title B'
    })
    expect(readSourceTitle).toHaveBeenCalledTimes(2)
  })

  it('dedupes repeated source paths before reading', async () => {
    const readSourceTitle = vi.fn().mockResolvedValue('Shared')
    vi.stubGlobal('window', {
      ryte: {
        files: {
          readSourceTitle
        }
      }
    })

    const titles = useDocumentTitles(computed(() => ['a.md', 'a.md']))
    await flushAsync()

    expect(titles.value).toEqual({ 'a.md': 'Shared' })
    expect(readSourceTitle).toHaveBeenCalledOnce()
  })

  it('refreshes already cached titles when the refresh key changes', async () => {
    const readSourceTitle = vi
      .fn()
      .mockResolvedValueOnce('Old Title')
      .mockResolvedValueOnce('New Title')
    vi.stubGlobal('window', {
      ryte: {
        files: {
          readSourceTitle
        }
      }
    })

    const sourcePaths = ref(['a.md'])
    const refreshKey = ref(1)
    const titles = useDocumentTitles(sourcePaths, refreshKey)
    await flushAsync()

    refreshKey.value = 2
    await flushAsync()

    expect(titles.value).toEqual({ 'a.md': 'New Title' })
    expect(readSourceTitle).toHaveBeenCalledTimes(2)
  })
})
