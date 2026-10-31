import { indexer } from './indexer'
import { tasks } from './tasks'

/** Every operation and event Ryte exposes across the main/preload boundary, by area. */
export const contract = { indexer, tasks } as const

export type Contract = typeof contract
