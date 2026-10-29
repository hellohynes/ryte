const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'give',
  'i',
  'in',
  'is',
  'it',
  'me',
  'of',
  'on',
  'or',
  'please',
  'show',
  'the',
  'to',
  'with'
])

const MAX_FTS_TERMS = 12

function variantsFor(token: string): string[] {
  const variants = [token]
  if (token.length > 4 && token.endsWith('ies')) {
    variants.push(`${token.slice(0, -3)}y`)
  } else if (token.length > 4 && token.endsWith('es')) {
    variants.push(token.slice(0, -2))
  } else if (token.length > 3 && token.endsWith('s')) {
    variants.push(token.slice(0, -1))
  }
  return variants
}

export function buildFtsMatchQuery(input: string): string | null {
  const unique = new Set<string>()
  const tokens = input.match(/[\p{L}\p{N}_]+/gu) ?? []

  for (const rawToken of tokens) {
    const token = rawToken.toLowerCase()
    if (STOP_WORDS.has(token)) continue
    for (const variant of variantsFor(token)) {
      if (!STOP_WORDS.has(variant)) unique.add(variant)
      if (unique.size >= MAX_FTS_TERMS) break
    }
    if (unique.size >= MAX_FTS_TERMS) break
  }

  if (unique.size === 0) return null
  return [...unique].map((token) => `"${token}"`).join(' OR ')
}
