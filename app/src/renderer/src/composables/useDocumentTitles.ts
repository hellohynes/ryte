import { readonly, ref, watch, type Ref } from 'vue'

async function readDocumentTitle(sourcePath: string): Promise<[string, string] | null> {
  try {
    const title = await window.ryte.files.readSourceTitle({ sourcePath })
    return title ? [sourcePath, title] : null
  } catch {
    return null
  }
}

export function useDocumentTitles(
  sourcePaths: Ref<string[]>,
  refreshKey?: Ref<unknown>
): Readonly<Ref<Record<string, string>>> {
  const titles = ref<Record<string, string>>({})
  let requestId = 0
  let lastRefreshKey: unknown

  watch(
    () => [sourcePaths.value, refreshKey?.value] as const,
    ([paths, nextRefreshKey]) => {
      const currentRequestId = ++requestId
      const visiblePathSet = new Set(paths)
      const forceRefresh = nextRefreshKey !== lastRefreshKey
      lastRefreshKey = nextRefreshKey
      const unresolvedPaths = [...visiblePathSet].filter(
        (sourcePath) => forceRefresh || !titles.value[sourcePath]
      )
      if (unresolvedPaths.length === 0) return

      void Promise.all(unresolvedPaths.map((sourcePath) => readDocumentTitle(sourcePath))).then(
        (resolvedTitles) => {
          if (currentRequestId !== requestId) return

          const nextTitles = { ...titles.value }
          for (const resolvedTitle of resolvedTitles) {
            if (!resolvedTitle) continue
            const [sourcePath, title] = resolvedTitle
            if (visiblePathSet.has(sourcePath)) nextTitles[sourcePath] = title
          }
          titles.value = nextTitles
        }
      )
    },
    { immediate: true }
  )

  return readonly(titles)
}
