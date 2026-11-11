import { app } from './app'
import { code } from './code'
import { dialog } from './dialog'
import { files } from './files'
import { indexer } from './indexer'
import { localhost } from './localhost'
import { page } from './page'
import { pictures } from './pictures'
import { search } from './search'
import { settings } from './settings'
import { tasks } from './tasks'
import { video } from './video'
import { workspace } from './workspace'

/** Every operation and event Ryte exposes across the main/preload boundary, by area. */
export const contract = {
  app,
  code,
  dialog,
  files,
  indexer,
  localhost,
  page,
  pictures,
  search,
  settings,
  tasks,
  video,
  workspace
} as const

export type Contract = typeof contract
