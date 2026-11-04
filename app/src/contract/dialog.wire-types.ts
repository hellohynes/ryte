// FROZEN SNAPSHOT of the hand-written `dialog.openFolder` declaration in `src/preload/index.ts` before the contract
// replaced it (copied from git at a8e06fa). It is the oracle for the type-equality check in
// `dialog.wire-types.check.ts`: the type inferred from the contract must equal it. Do not edit.
// `dialog.openFile` was declared next to it and was deleted, not migrated.

export interface DialogApi {
  openFolder(): Promise<string | null>
}
