import { app } from './app'
import { dialog } from './dialog'
import { indexer } from './indexer'
import { settings } from './settings'
import { tasks } from './tasks'

/** Every operation and event Ryte exposes across the main/preload boundary, by area. */
export const contract = { app, dialog, indexer, settings, tasks } as const

export type Contract = typeof contract
