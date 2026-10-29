import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue'

import { parseStructuredAnswer } from '../../../shared/answer-sections'
import { buildCitedSources, citationNumbers, type CitedSource } from '../components/cited-sources'
import {
  advanceTyping,
  initialTyping,
  typedMarkdown,
  typingComplete,
  writingFlags,
  type TypingPieces,
  type TypingState
} from '../components/section-typing'
import {
  createPresentationEngine,
  type PresentationPhase,
  type PresentationState
} from '../components/search-presentation'
import {
  formatThoughtFor,
  liveTraceLines,
  newestSourcePaths,
  savedSummaryLines,
  summaryBuildLines,
  type TraceLine
} from '../components/research-trace-model'
import { documentTitle } from '../components/search-result-model'
import type { useSearchStore } from '../stores/search'

type SearchStore = ReturnType<typeof useSearchStore>

/** What is being written right now: the overview and each section, by position. */
export interface WritingFlags {
  lead: boolean
  sections: boolean[]
}

const NOT_WRITING: WritingFlags = { lead: false, sections: [] }

function piecesOf(answer: string): TypingPieces {
  const parsed = parseStructuredAnswer(answer)
  return parsed
    ? { structured: true, lead: parsed.tldr, sections: parsed.sections }
    : { structured: false, lead: answer, sections: [] }
}

export interface SearchPresentation {
  phase: Ref<PresentationPhase>
  /** Thinking lines currently on screen. */
  traceLines: ComputedRef<TraceLine[]>
  /** True while the box is open and shimmering: searching, then writing the summary. */
  working: ComputedRef<boolean>
  /** Header of the thinking box: "Thinking…" while it runs, then how long it took. */
  thoughtLabel: ComputedRef<string | null>
  /** The part of the answer that has been typed so far. */
  displayedAnswer: ComputedRef<string>
  /** True while the answer is still being typed. */
  typing: ComputedRef<boolean>
  /** Which pieces are being written now; sections write at the same time, each at its own pace. */
  writing: ComputedRef<WritingFlags>
  /** Paths whose titles the thinking line for the newest notes needs. */
  newestPaths: ComputedRef<string[]>
  citedSources: ComputedRef<CitedSource[]>
  /** True when a search ended with no summary, so its results are the whole answer. */
  resultsOpenByDefault: ComputedRef<boolean>
  numbers: ComputedRef<Map<number, number>>
}

/**
 * Drives what a search looks like over time. The store receives data as fast as the provider sends
 * it; this decides when each piece is shown: thinking lines one at a time, then the answer typed at
 * a steady pace, with each cited source appearing when its marker is typed.
 */
export function useSearchPresentation(
  search: SearchStore,
  titles: Readonly<Ref<Record<string, string>>>
): SearchPresentation {
  const engine = createPresentationEngine()
  // Reduced motion shows everything as it arrives: no paced lines, no typing.
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  const enginePhase = ref<PresentationPhase>('idle')
  const revealedLines = ref(0)
  const thoughtMs = ref<number | null>(null)
  const typedAnswer = ref('')
  const writingNow = ref<WritingFlags>(NOT_WRITING)
  let frame = 0
  let plan: TypingState = initialTyping()
  let lastTickAt = 0

  const newestPaths = computed(() => newestSourcePaths(search.sources, 2))
  const specs = computed(() =>
    liveTraceLines({
      stage: search.stage,
      query: search.query,
      fileCount: new Set(search.sources.map((source) => source.sourcePath)).size,
      newestTitles: newestPaths.value.map((path) => titles.value[path] ?? documentTitle(path))
    })
  )
  const restored = computed(() => search.restoredSnapshotId !== null)

  function sync(state: PresentationState): void {
    enginePhase.value = state.phase
    revealedLines.value = state.revealedLines
    thoughtMs.value = state.thoughtMs
  }

  function tick(now: number): void {
    frame = 0
    const elapsed = now - lastTickAt
    lastTickAt = now
    const finished = search.status === 'done' || search.status === 'error'

    // The text is typed once the thinking lines have played out. Each piece (the overview, then
    // every section) has its own cursor, so a long summary does not wait on its sections in turn.
    let typingDone = false
    if (engine.state.phase === 'answering') {
      const pieces = piecesOf(search.answer)
      plan = advanceTyping(plan, pieces, now, elapsed, finished)
      typedAnswer.value = typedMarkdown(pieces, plan)
      writingNow.value = writingFlags(pieces, plan, finished)
      typingDone = typingComplete(pieces, plan, finished)
    }

    sync(
      engine.tick(
        {
          status: search.status,
          answerLength: search.answer.length,
          lineCount: specs.value.length,
          typingDone
        },
        now
      )
    )
    if (engine.state.phase === 'thinking' || engine.state.phase === 'answering') {
      frame = window.requestAnimationFrame(tick)
    }
  }

  function ensureLoop(): void {
    if (!frame) frame = window.requestAnimationFrame(tick)
  }

  const phase = computed<PresentationPhase>(() => {
    if (!reduced) return enginePhase.value
    if (search.status === 'idle') return 'idle'
    return search.status === 'searching' || search.status === 'streaming' ? 'thinking' : 'settled'
  })

  watch(
    () => search.status,
    (status, previous) => {
      if (reduced) return
      const wasRunning = previous === 'searching' || previous === 'streaming'
      if (status === 'searching' && !wasRunning) {
        plan = initialTyping()
        typedAnswer.value = ''
        writingNow.value = NOT_WRITING
        lastTickAt = performance.now()
        sync(engine.start(performance.now()))
        ensureLoop()
      } else if (status === 'idle') {
        sync(engine.reset())
      } else if (status === 'done' && !wasRunning && engine.state.phase !== 'settled') {
        // A saved summary: nothing to play back.
        sync(engine.settle(specs.value.length))
      } else {
        ensureLoop()
      }
    }
  )

  // Restoring one saved summary after another leaves the status at "done", so watch the snapshot.
  watch(
    () => search.restoredSnapshotId,
    (id) => {
      if (id && !reduced) sync(engine.settle(specs.value.length))
    }
  )

  onBeforeUnmount(() => window.cancelAnimationFrame(frame))

  // While the summary is written, the box keeps going: a line for the overview, one per area, and
  // the last one names the note that passage draws on.
  const buildLines = computed(() => {
    const text = displayedAnswer.value
    const structured = parseStructuredAnswer(text)
    const current = structured ? (structured.sections.at(-1)?.body ?? structured.tldr) : text
    let currentSourceTitle: string | null = null
    if (phase.value !== 'settled') {
      const marker = [...current.matchAll(/\[(\d+)\]/g)]
        .map((match) => search.citations.find((citation) => citation.index === Number(match[1])))
        .filter((citation) => citation !== undefined)
        .at(-1)
      if (marker)
        currentSourceTitle = titles.value[marker.sourcePath] ?? documentTitle(marker.sourcePath)
    }
    return summaryBuildLines({ structured, hasText: text.length > 0, currentSourceTitle })
  })

  const traceLines = computed<TraceLine[]>(() => {
    if (restored.value) {
      return savedSummaryLines({
        query: search.query,
        sources: search.sources,
        citations: search.citations
      })
    }
    const thinking = reduced ? specs.value : specs.value.slice(0, revealedLines.value)
    const lines = [...thinking, ...buildLines.value]
    return lines.map((line, index) => ({
      ...line,
      state: phase.value !== 'settled' && index === lines.length - 1 ? 'active' : 'done'
    }))
  })

  /** True from the first search line until the last word is typed; the box stays open and live. */
  const working = computed(() => phase.value === 'thinking' || phase.value === 'answering')

  const thoughtLabel = computed(() => {
    if (phase.value === 'idle') return null
    if (working.value) return 'Thinking…'
    if (restored.value) return 'Saved summary'
    const { startedAt, completedAt } = search.trace
    const elapsed =
      reduced && startedAt !== null && completedAt !== null ? completedAt - startedAt : 0
    return formatThoughtFor(thoughtMs.value ?? elapsed)
  })

  const displayedAnswer = computed(() => {
    const full = search.answer
    if (reduced) return full
    if (phase.value === 'answering') return typedAnswer.value
    if (phase.value === 'settled') return full
    // Still thinking, even if the provider has already finished: the text is typed once the
    // thinking lines have played, never shown whole and then typed again.
    return ''
  })

  const resultsOpenByDefault = computed(
    () => phase.value === 'settled' && !restored.value && search.answer.length === 0
  )

  const typing = computed(() => !reduced && phase.value === 'answering')
  // Numbers follow the whole text received, so they never change while sections write at once.
  const numbers = computed(() => citationNumbers(search.answer, search.citations))
  const citedSources = computed(() =>
    buildCitedSources(search.answer, search.citations, displayedAnswer.value)
  )
  const writing = computed(() => (phase.value === 'answering' ? writingNow.value : NOT_WRITING))

  return {
    phase,
    working,
    traceLines,
    thoughtLabel,
    displayedAnswer,
    typing,
    writing,
    newestPaths,
    citedSources,
    resultsOpenByDefault,
    numbers
  }
}
