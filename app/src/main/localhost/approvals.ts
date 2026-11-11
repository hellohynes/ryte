import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { parseLocalAddress } from '../../shared/local-address'

const MAX_APPROVALS = 200

export interface Approvals {
  list(): string[]
  has(origin: string): boolean
  add(origin: string): void
  remove(origin: string): void
}

function readOrigins(path: string): string[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'))
    if (!Array.isArray(parsed)) return []
    const origins: string[] = []
    for (const entry of parsed) {
      // Only a real local origin, in the spelling the store writes, is trusted from disk.
      const address = typeof entry === 'string' ? parseLocalAddress(entry) : null
      if (address && address.origin === entry && !origins.includes(entry)) origins.push(entry)
    }
    return origins.slice(0, MAX_APPROVALS)
  } catch {
    return []
  }
}

/**
 * The origins the person chose to always allow, kept in a small file beside the settings. A missing or damaged
 * file reads as "nothing approved", never as an error.
 */
export function createApprovals(getFilePath: () => string): Approvals {
  let origins: string[] | null = null
  const load = (): string[] => (origins ??= readOrigins(getFilePath()))
  const save = (next: string[]): void => {
    const filePath = getFilePath()
    mkdirSync(dirname(filePath), { recursive: true })
    const temp = `${filePath}.tmp`
    writeFileSync(temp, JSON.stringify(next, null, 2), 'utf-8')
    renameSync(temp, filePath)
    origins = next
  }
  return {
    list: () => [...load()],
    has: (origin) => load().includes(origin),
    add(origin) {
      const current = load()
      if (current.includes(origin)) return
      save([...current, origin].slice(-MAX_APPROVALS))
    },
    remove(origin) {
      const current = load()
      if (current.includes(origin)) save(current.filter((entry) => entry !== origin))
    }
  }
}
