// Vectors where the new schema is deliberately stricter than the recorded legacy behavior. Each is asserted
// (not skipped), so a change in either direction fails the test. A difference is allowed only when the new
// behavior is stricter; anything that accepts more than the old validator did is a defect.
const ACKNOWLEDGEMENT_EXTRA_FIELDS =
  'An acknowledgement is a strict object of exactly acknowledgedAt, provider and model (owner decision, ' +
  '2026-11-02). The legacy validator accepted extra fields and stored them in settings.json; the UI sends ' +
  'exactly three fields, so nothing legitimate is rejected.'

export const ACCEPTED_DEVIATIONS: Record<string, { accepted: false; reason: string }> = {
  'save: inherited unknown key only': {
    accepted: false,
    reason:
      'Zod strict objects reject an inherited enumerable unknown key; the legacy check read own keys only. ' +
      'Structured clone over IPC delivers plain objects, so the input is unreachable.'
  },
  'save: deleteProviderKeys sparse': {
    accepted: false,
    reason:
      'Zod rejects the hole in a sparse array; the legacy .map skipped holes and accepted it. The UI builds ' +
      'dense arrays, so only a caller that bypasses the typed API could send one.'
  },
  'save: cloudAnswersAcknowledgement with an extra key': {
    accepted: false,
    reason: ACKNOWLEDGEMENT_EXTRA_FIELDS
  },
  'save: cloudAnswersAcknowledgement with an own __proto__ key': {
    accepted: false,
    reason: ACKNOWLEDGEMENT_EXTRA_FIELDS
  },
  'save: semanticIndexAcknowledgement with an extra key': {
    accepted: false,
    reason: ACKNOWLEDGEMENT_EXTRA_FIELDS
  },
  'save: semanticIndexAcknowledgement with an own __proto__ key': {
    accepted: false,
    reason: ACKNOWLEDGEMENT_EXTRA_FIELDS
  }
}
