import { tasks } from './tasks'

/** Every operation and event Ryte exposes across the main/preload boundary, by area. */
export const contract = { tasks } as const

export type Contract = typeof contract
