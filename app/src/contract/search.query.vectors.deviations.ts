// Where the new `search.query` and `search.cancel` inputs differ from the recorded behavior of the validators they
// replaced. Each entry is asserted (not skipped), so a change in either direction fails the test. A difference is
// allowed only when the new behavior is stricter or the old input has no equivalent any more; anything that accepts
// more than the old validators did is a defect.

// Where the new schema is stricter than the recorded validator, for an input that can be sent.
export const ACCEPTED_DEVIATIONS: Record<string, { accepted: false; reason: string }> = {}

// `query(q, options)` became `query({ query, ...options })`, so an options value that is not a plain object (or
// `undefined` or `null`, which mean no options) cannot be written as the new input. The old validator rejected
// most of these; the few it accepted (a class instance, a Date, a Map, an object with inherited keys) were read
// through `in` and `Object.keys`, and a typed caller that spreads them into the new object keeps only their own
// enumerable keys. None of them can arrive over structured clone.
const NOT_AN_OBJECT =
  'Not a plain object: the new input is one object, so this value has no equivalent. The old validator rejected it.'
const EXOTIC_OBJECT =
  'An object with a prototype other than Object.prototype: the old validator read it through `in` and own keys. ' +
  'Spreading it into the new object keeps its own keys only, and structured clone delivers plain objects.'

const QUERY_KEY =
  'A `query` key among the options: the old validator rejected it as an unknown option. In the new input that key ' +
  'is the query text itself, so there is no way to write it as an option.'

export const NO_LONGER_REPRESENTABLE: Record<string, string> = {
  'searchOptions: query key': QUERY_KEY,
  'searchOptions: empty array': NOT_AN_OBJECT,
  'searchOptions: array holding valid options': NOT_AN_OBJECT,
  'searchOptions: string': NOT_AN_OBJECT,
  'searchOptions: empty string': NOT_AN_OBJECT,
  'searchOptions: number': NOT_AN_OBJECT,
  'searchOptions: zero': NOT_AN_OBJECT,
  'searchOptions: boolean true': NOT_AN_OBJECT,
  'searchOptions: boolean false': NOT_AN_OBJECT,
  'searchOptions: bigint': NOT_AN_OBJECT,
  'searchOptions: symbol': NOT_AN_OBJECT,
  'searchOptions: function': NOT_AN_OBJECT,
  'searchOptions: String object': NOT_AN_OBJECT,
  'searchOptions: Date instance': EXOTIC_OBJECT,
  'searchOptions: Map': EXOTIC_OBJECT,
  'searchOptions: class instance with valid own fields': EXOTIC_OBJECT,
  'searchOptions: class instance with a method on the prototype': EXOTIC_OBJECT,
  'searchOptions: inherited retrievalMode only': EXOTIC_OBJECT,
  'searchOptions: inherited valid keys beside one own valid key': EXOTIC_OBJECT,
  'searchOptions: inherited invalid retrievalMode only': EXOTIC_OBJECT,
  'searchOptions: inherited unknown key only': EXOTIC_OBJECT,
  'searchOptions: own valid key beside an inherited unknown key': EXOTIC_OBJECT
}
