// Vectors where the new schema is deliberately stricter than the recorded legacy behavior. Each is asserted
// (not skipped), so a change in either direction fails the test. A difference is allowed only when the new
// behavior is stricter; anything that accepts more than the old validator did is a defect.
const INHERITED_UNKNOWN_KEY =
  'Zod strict objects reject an inherited enumerable unknown key; the legacy check read own keys only. ' +
  'Structured clone over IPC delivers plain objects, so the input is unreachable.'

export const ACCEPTED_DEVIATIONS: Record<string, { accepted: false; reason: string }> = {
  'fileRef: own sourcePath beside an inherited unknown key': {
    accepted: false,
    reason: INHERITED_UNKNOWN_KEY
  },
  'rename: own sourcePath beside an inherited unknown key': {
    accepted: false,
    reason: INHERITED_UNKNOWN_KEY
  },
  'sourceTitle: own sourcePath beside an inherited unknown key': {
    accepted: false,
    reason: INHERITED_UNKNOWN_KEY
  },
  'tabFile: own tabId beside an inherited unknown key': {
    accepted: false,
    reason: INHERITED_UNKNOWN_KEY
  }
}
