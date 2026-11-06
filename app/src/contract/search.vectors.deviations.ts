// Vectors where the new schema is deliberately stricter than the recorded legacy behavior. Each is asserted
// (not skipped), so a change in either direction fails the test. A difference is allowed only when the new
// behavior is stricter; anything that accepts more than the old validator did is a defect.
const SPARSE_ARRAY =
  'The legacy check used `every`, which skips holes, and then put `undefined` in the path list. The new schema ' +
  'reads a hole as `undefined` and refuses it. The renderer sends a dense array.'

export const ACCEPTED_DEVIATIONS: Record<string, { accepted: false; reason: string }> = {
  'freshness: valid own keys beside an inherited unknown key': {
    accepted: false,
    reason:
      'Zod strict objects reject an inherited enumerable unknown key; the legacy check read own keys only. ' +
      'Structured clone over IPC delivers plain objects, so the input is unreachable.'
  },
  'freshness: sourcePaths sparse array with a hole': { accepted: false, reason: SPARSE_ARRAY },
  'freshness: sourcePaths sparse array with a trailing hole': {
    accepted: false,
    reason: SPARSE_ARRAY
  },
  'freshness: sourcePaths only holes': { accepted: false, reason: SPARSE_ARRAY }
}
