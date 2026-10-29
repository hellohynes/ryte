// Typing speed, in characters per second. The text should read as being written, so it is held
// below a ceiling however much has already arrived, and never drops below a floor that would feel
// stuck. Speed within that range follows the backlog, so a long summary types faster than a short
// one instead of taking proportionally longer.
const MIN_RATE = 55
const MAX_RATE = 140
const CATCH_UP_SECONDS = 4
// Once the provider has finished, the same range moves up so the wait stays bounded.
const FINISH_MIN_RATE = 80
const FINISH_MAX_RATE = 220
const FINISH_CATCH_UP_SECONDS = 2.5

/**
 * How much of the answer text may be shown: never a partly written citation marker (`[`, `[1`),
 * which would flash as brackets and then snap into a superscript.
 */
export function safeDisplayLength(text: string, requested: number): number {
  const length = Math.min(Math.max(0, Math.floor(requested)), text.length)
  const partial = /\[\d*$/.exec(text.slice(0, length))
  return partial ? length - partial[0].length : length
}

/**
 * Next display position for a text reveal that is decoupled from how tokens arrive. Returns a
 * fractional position so slow rates stay smooth across frames.
 */
export function advanceDisplayed(
  current: number,
  target: number,
  elapsedMs: number,
  finishing: boolean
): number {
  const backlog = Math.max(0, target - current)
  const [min, max, horizon] = finishing
    ? [FINISH_MIN_RATE, FINISH_MAX_RATE, FINISH_CATCH_UP_SECONDS]
    : [MIN_RATE, MAX_RATE, CATCH_UP_SECONDS]
  const rate = Math.min(max, Math.max(min, backlog / horizon))
  return Math.min(target, current + (rate * Math.max(0, elapsedMs)) / 1000)
}
