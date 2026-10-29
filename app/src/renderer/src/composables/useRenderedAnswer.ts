import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue'

import { parseStructuredAnswer } from '../../../shared/answer-sections'
import {
  isTimelineTitle,
  parseTimelineItems,
  type TimelineStatus
} from '../../../shared/answer-timeline'
import { appendCaret, linkAnswerCitations, stripParagraph } from '../components/answer-html'
import { createAnswerRenderScheduler } from '../components/search-answer-render-scheduler'
import { render } from '../markdown/renderer'
import type { WritingFlags } from './useSearchPresentation'
import type { SearchCitation } from '../../../preload/index'

export interface RenderedTimelineItem {
  status: TimelineStatus
  date: string | null
  /** Ticket keys and PR numbers the step names. */
  refs: string[]
  html: string
}

export interface RenderedSection {
  id: string
  title: string
  html: string
  /** This section's own text is still being written. */
  writing: boolean
  /** Set for the Done / Now / Next section, which is shown as a vertical timeline. */
  timeline?: RenderedTimelineItem[]
}

/** `lead` is the TL;DR (or the whole answer when it is not in the structured shape). */
export interface RenderedAnswer {
  lead: string
  sections: RenderedSection[]
}

const EMPTY_ANSWER: RenderedAnswer = { lead: '', sections: [] }

interface AnswerSource {
  /** The part of the answer that is on screen. */
  answer: Ref<string>
  citations: Ref<SearchCitation[]>
  numbers: Ref<Map<number, number>>
  /** True while the answer is being typed, which adds the caret. */
  typing: Ref<boolean>
  /** Which pieces are being written now; each one that is gets a caret. */
  writing: Ref<WritingFlags>
}

async function renderPiece(
  markdown: string,
  citations: SearchCitation[],
  numbers: Map<number, number>
): Promise<string> {
  return markdown ? linkAnswerCitations(await render(markdown), citations, numbers) : ''
}

/**
 * Renders the answer Markdown to HTML with linked citation markers. A structured answer
 * (TL;DR plus area sections) is rendered piece by piece so the sections can collapse; anything
 * else renders as one block. While text is being typed a caret follows the last word.
 */
export function useRenderedAnswer(source: AnswerSource): {
  renderedAnswer: Ref<RenderedAnswer>
  hasAnswer: ComputedRef<boolean>
} {
  const renderedAnswer = ref<RenderedAnswer>(EMPTY_ANSWER)
  const hasAnswer = computed(
    () => renderedAnswer.value.lead.length > 0 || renderedAnswer.value.sections.length > 0
  )

  const scheduler = createAnswerRenderScheduler(
    () => source.answer.value,
    async (markdown) => {
      const citations = source.citations.value
      const numbers = source.numbers.value
      const parsed = parseStructuredAnswer(markdown)
      const next: RenderedAnswer = parsed
        ? {
            lead: await renderPiece(parsed.tldr, citations, numbers),
            sections: await Promise.all(
              parsed.sections.map(async (section, index): Promise<RenderedSection> => {
                const items = isTimelineTitle(section.title) ? parseTimelineItems(section.body) : []
                const writing = source.writing.value.sections[index] ?? false
                // While it is being written the timeline shows from its title, with a stand-in
                // for the first step; one that ends up with no readable steps falls back to text.
                const asTimeline = items.length > 0 || (isTimelineTitle(section.title) && writing)
                return {
                  id: `section-${index}`,
                  title: section.title,
                  html: asTimeline ? '' : await renderPiece(section.body, citations, numbers),
                  writing,
                  ...(asTimeline && {
                    timeline: await Promise.all(
                      items.map(async (item) => ({
                        status: item.status,
                        date: item.date,
                        refs: item.refs,
                        html: stripParagraph(await renderPiece(item.text, citations, numbers))
                      }))
                    )
                  })
                }
              })
            )
          }
        : { lead: await renderPiece(markdown, citations, numbers), sections: [] }
      if (markdown !== source.answer.value) return

      if (source.typing.value) {
        // Every piece still being written shows the caret: sections write at the same time.
        if (source.writing.value.lead && next.lead) next.lead = appendCaret(next.lead)
        for (const section of next.sections) {
          if (!section.writing) continue
          const lastStep = section.timeline?.at(-1)
          if (lastStep) lastStep.html = appendCaret(lastStep.html)
          else if (section.html) section.html = appendCaret(section.html)
        }
      }
      renderedAnswer.value = next
    }
  )

  watch(
    [source.answer, source.citations, source.numbers, source.writing],
    ([markdown]) => {
      if (!markdown) renderedAnswer.value = EMPTY_ANSWER
      scheduler.schedule()
    },
    { deep: true }
  )

  // Render once more when typing ends so the caret goes away.
  watch(source.typing, () => void scheduler.flush())

  onBeforeUnmount(() => scheduler.dispose())

  return { renderedAnswer, hasAnswer }
}
