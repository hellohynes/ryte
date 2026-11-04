import { app } from './app'
import { dialog } from './dialog'
import { indexer } from './indexer'
import { settings } from './settings'
import { tasks } from './tasks'
import { workspace } from './workspace'

/** Every operation and event Ryte exposes across the main/preload boundary, by area. */
export const contract = { app, dialog, indexer, settings, tasks, workspace } as const

export type Contract = typeof contract
