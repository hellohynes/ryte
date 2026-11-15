import { z } from 'zod'

// The one machine definition of the question record. The contract page in the owner's notes says
// the same thing in words; if they disagree, the page is fixed first.

const id = z.string().min(1)
const text = z.string().trim().min(1)

const option = z.object({
  id,
  label: text,
  detail: z.string().optional(),
})

const choiceDecision = z.object({
  type: z.literal('choice'),
  id,
  title: text,
  question: text,
  options: z.array(option).min(2),
  recommended: id.optional(),
})

const textDecision = z.object({
  type: z.literal('text'),
  id,
  title: text,
  question: text,
  placeholder: z.string().optional(),
})

const decision = z.discriminatedUnion('type', [choiceDecision, textDecision])

const evidence = z.object({
  title: text,
  items: z.array(z.string()),
})

export const askInput = z
  .object({
    session: text.describe('a short name for this session, for example blog-intro'),
    title: text.describe('one line: what this is about'),
    summary: z.string().optional().describe('a few sentences of context, enough to decide without opening anything else'),
    decisions: z
      .array(decision)
      .min(1)
      .describe('one or more decisions; a choice needs two or more options, and recommended names one of them'),
    evidence: z.array(evidence).optional().describe('optional supporting lists, each with a title and items'),
  })
  .superRefine((value, ctx) => {
    const seen = new Set()
    value.decisions.forEach((d, i) => {
      if (seen.has(d.id)) {
        ctx.addIssue({ code: 'custom', path: ['decisions', i, 'id'], message: `Decision id "${d.id}" is used twice` })
      }
      seen.add(d.id)
      if (d.type !== 'choice') return
      const optionIds = new Set()
      d.options.forEach((o, j) => {
        if (optionIds.has(o.id)) {
          ctx.addIssue({ code: 'custom', path: ['decisions', i, 'options', j, 'id'], message: `Option id "${o.id}" is used twice in decision "${d.id}"` })
        }
        optionIds.add(o.id)
      })
      if (d.recommended !== undefined && !optionIds.has(d.recommended)) {
        ctx.addIssue({ code: 'custom', path: ['decisions', i, 'recommended'], message: `Recommended "${d.recommended}" is not an option of decision "${d.id}"` })
      }
    })
  })

// Returns the parsed input, or throws an Error whose message lists each problem on its own line.
export function validateAskInput(input) {
  const result = askInput.safeParse(input)
  if (result.success) return result.data
  const lines = result.error.issues.map((issue) => {
    const where = issue.path.length ? issue.path.join('.') : 'question'
    return `${where}: ${issue.message}`
  })
  throw new Error(`Invalid question:\n${lines.join('\n')}`)
}
