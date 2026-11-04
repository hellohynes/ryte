import type { Contract } from '../../contract'
import type { Handlers } from './register'

export interface AppHandlerDependencies {
  getVersion: () => string
}

export function createAppHandlers({
  getVersion
}: AppHandlerDependencies): Handlers<Contract>['app'] {
  return {
    getVersion: async () => getVersion()
  }
}
