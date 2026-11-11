import type { Contract } from '../../contract'
import type { PageBox } from '../page/page-box'
import type { Handlers } from './register'

/** The locked page view. The view belongs to the window that asked; the box keeps one page per window. */
export function createPageHandlers(box: PageBox): Handlers<Contract>['page'] {
  return {
    show: async ({ path, bounds }, { sender }) => ({
      status: await box.show(sender, path, bounds)
    }),
    setBounds: ({ bounds }, { sender }) => box.setBounds(sender, bounds),
    hide: async (_input, { sender }) => ({ still: await box.hide(sender) }),
    close: (_input, { sender }) => box.close(sender)
  }
}
