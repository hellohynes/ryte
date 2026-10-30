import { contract, type Contract } from '../../contract'
import type { TaskFactsService } from '../facts/task-facts-service'
import type { Emit, Handlers } from './register'

export interface TaskHandlerDependencies {
  service: Pick<TaskFactsService, 'list' | 'refresh' | 'toggle'>
  settings: { load(): { notesRoot: string } }
  emit: Emit
}

/**
 * The handlers for the `tasks` operations. Built from injected dependencies so the toggle's "emit only
 * when the toggle succeeded" behavior can be tested without Electron or the real service.
 */
export function createTaskHandlers({
  service,
  settings,
  emit
}: TaskHandlerDependencies): Handlers<Contract>['tasks'] {
  return {
    list: async (input) => service.list(settings.load().notesRoot, input),

    refresh: async () => {
      const snapshot = await service.refresh(settings.load().notesRoot)
      return {
        notesRoot: snapshot.notesRoot,
        taskCount: snapshot.tasks.length,
        refreshedAt: snapshot.refreshedAt
      }
    },

    toggle: async (input) => {
      const result = await service.toggle(settings.load().notesRoot, input)
      if (result.ok) emit(contract.tasks.events.changed)
      return result
    }
  }
}
