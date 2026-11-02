import { indexer } from './indexer'
import { settings } from './settings'
import { tasks } from './tasks'

/** Every operation and event Ryte exposes across the main/preload boundary, by area. */
export const contract = { indexer, settings, tasks } as const

export type Contract = typeof contract
