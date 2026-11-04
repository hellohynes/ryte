// FROZEN SNAPSHOT of the hand-written `app.getVersion` declaration in `src/preload/index.ts` before the contract
// replaced it (copied from git at a8e06fa). It is the oracle for the type-equality check in
// `app.wire-types.check.ts`: the type inferred from the contract must equal it. Do not edit.

export interface AppApi {
  getVersion(): Promise<string>
}
