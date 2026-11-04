import { describe, expect, it, vi, type Mock } from 'vitest'

import { contract } from '../../contract'
import { createDialogHandlers, type DialogHandlerDependencies } from './dialog-handlers'
import { registerOperations } from './register'

interface FakeWindow {
  id: string
}

const sender = { id: 'sender' } as never
const askingWindow: FakeWindow = { id: 'asking-window' }

type ShowOpenDialog = DialogHandlerDependencies<FakeWindow>['showOpenDialog']

function setup(
  result: { canceled: boolean; filePaths: string[] },
  windowFor: () => FakeWindow | null = () => askingWindow
): {
  handlers: ReturnType<typeof createDialogHandlers<FakeWindow>>
  showOpenDialog: Mock<ShowOpenDialog>
  lookup: Mock<DialogHandlerDependencies<FakeWindow>['windowFor']>
} {
  const showOpenDialog = vi.fn<ShowOpenDialog>(async () => result)
  const lookup = vi.fn<DialogHandlerDependencies<FakeWindow>['windowFor']>(windowFor)
  const handlers = createDialogHandlers<FakeWindow>({ windowFor: lookup, showOpenDialog })
  return { handlers, showOpenDialog, lookup }
}

describe('dialog handlers: openFolder', () => {
  it('returns null when the picker was cancelled', async () => {
    const { handlers } = setup({ canceled: true, filePaths: ['/chosen'] })

    await expect(handlers.openFolder(undefined, { sender })).resolves.toBeNull()
  })

  it('returns null when nothing was selected', async () => {
    const { handlers } = setup({ canceled: false, filePaths: [] })

    await expect(handlers.openFolder(undefined, { sender })).resolves.toBeNull()
  })

  it('returns the first selected path', async () => {
    const { handlers } = setup({ canceled: false, filePaths: ['/first', '/second'] })

    await expect(handlers.openFolder(undefined, { sender })).resolves.toBe('/first')
  })

  it('asks for a directory', async () => {
    const { handlers, showOpenDialog } = setup({ canceled: false, filePaths: ['/chosen'] })

    await handlers.openFolder(undefined, { sender })

    expect(showOpenDialog).toHaveBeenCalledWith(expect.anything(), {
      properties: ['openDirectory']
    })
  })

  it('parents the dialog to the window of the asking sender', async () => {
    const { handlers, showOpenDialog, lookup } = setup({ canceled: false, filePaths: ['/x'] })

    await handlers.openFolder(undefined, { sender })

    expect(lookup).toHaveBeenCalledWith(sender)
    expect(showOpenDialog.mock.calls[0]?.[0]).toBe(askingWindow)
  })

  it('shows the dialog unparented when the sender has no window', async () => {
    const { handlers, showOpenDialog } = setup({ canceled: false, filePaths: ['/x'] }, () => null)

    await expect(handlers.openFolder(undefined, { sender })).resolves.toBe('/x')
    expect(showOpenDialog.mock.calls[0]?.[0]).toBeNull()
  })
})

describe('dialog registration', () => {
  it('takes the window from the sender of the IPC call and rejects a stray argument before the handler', async () => {
    const handled = new Map<string, (event: { sender: never }, ...args: unknown[]) => unknown>()
    const showOpenDialog = vi.fn<ShowOpenDialog>(async () => ({
      canceled: false,
      filePaths: ['/x']
    }))
    const windowFor = vi.fn(() => askingWindow)
    registerOperations(
      { handle: (channel, listener) => handled.set(channel, listener as never) },
      { dialog: contract.dialog },
      { dialog: createDialogHandlers<FakeWindow>({ windowFor, showOpenDialog }) }
    )
    const listener = handled.get('dialog:open-folder')!

    await expect(listener({ sender })).resolves.toBe('/x')
    expect(windowFor).toHaveBeenCalledWith(sender)

    await expect(listener({ sender }, '/stray')).rejects.toThrow('Invalid dialog.openFolder input')
    expect(showOpenDialog).toHaveBeenCalledTimes(1)
  })
})
