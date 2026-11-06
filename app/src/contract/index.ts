import { app } from './app'
import { dialog } from './dialog'
import { files } from './files'
import { indexer } from './indexer'
import { search } from './search'
import { settings } from './settings'
import { tasks } from './tasks'
import { workspace } from './workspace'

/** Every operation and event Ryte exposes across the main/preload boundary, by area. */
export const contract = { app, dialog, files, indexer, search, settings, tasks, workspace } as const

export type Contract = typeof contract
