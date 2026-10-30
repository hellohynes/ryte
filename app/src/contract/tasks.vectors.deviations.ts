// Vectors where the new schema is deliberately stricter than the recorded legacy behavior. Each is
// asserted (not skipped), so a change in either direction fails the test.
export const ACCEPTED_DEVIATIONS: Record<string, { accepted: false; reason: string }> = {
  'list: inherited key is ignored': {
    accepted: false,
    reason:
      'Zod strict objects reject inherited enumerable keys, the legacy Object.keys check ignored them. ' +
      'Structured clone over IPC delivers plain objects, so the input is unreachable.'
  },
  'toggle: inherited key is ignored': {
    accepted: false,
    reason: 'Same as the list case.'
  }
}
