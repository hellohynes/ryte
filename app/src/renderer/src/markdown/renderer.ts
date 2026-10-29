import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import { fromHighlighter } from '@shikijs/markdown-it/core'
import { createHighlighter, createJavaScriptRegexEngine } from 'shiki'

import { isSafeLinkTarget, sanitizeRenderedHtml } from './sanitizer'

const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n?/
const MERMAID_LANGUAGE = 'mermaid'
const FENCE_RE = /^( {0,3})(`{3,}|~{3,})/
const TASK_RE = /^(\s*(?:[-+*]|\d+[.)])\s+)\[( |x|X)\](\s+.*?|\s*)$/
const FRONTMATTER_DELIMITER_RE = /^(---|\.\.\.)\s*$/
const TASK_INLINE_MARKER_RE = /^\[( |x|X)\]\s?/

// Languages that are pre-loaded at init so they're available synchronously
// for the markdown-it highlight callback. All are JS grammar files — no WASM.
const PRELOAD_LANGS = [
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'python',
  'bash',
  'sh',
  'zsh',
  'json',
  'jsonc',
  'yaml',
  'markdown',
  'html',
  'css',
  'vue',
  'sql',
  'rust',
  'go'
] as const

let mdPromise: Promise<MarkdownIt> | null = null

interface RenderOptions {
  interactiveTasks?: boolean
}

export interface MarkdownOutlineItem {
  id: string
  level: number
  text: string
}

export interface RenderedMarkdownDocument {
  html: string
  outline: MarkdownOutlineItem[]
}

interface RenderEnv {
  lineOffset?: number
  taskMarkers?: Map<number, RenderedTaskMarker>
  outline?: MarkdownOutlineItem[]
}

interface RenderedTaskMarker {
  line: number
  checkboxColumn: number
  checked: boolean
}

interface SourceLine {
  text: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderMermaidFence(content: string): string {
  return `<pre class="mermaid" data-mermaid-pending="true">${escapeHtml(content)}</pre>\n`
}

function splitLines(markdown: string): SourceLine[] {
  if (markdown.length === 0) return []

  const lines: SourceLine[] = []
  let start = 0
  for (let index = 0; index < markdown.length; index += 1) {
    const char = markdown[index]
    if (char !== '\n' && char !== '\r') continue

    lines.push({ text: markdown.slice(start, index) })
    if (char === '\r' && markdown[index + 1] === '\n') index += 1
    start = index + 1
  }

  if (start < markdown.length) {
    lines.push({ text: markdown.slice(start) })
  }

  return lines
}

function stripFrontmatterForRender(text: string): { text: string; lineOffset: number } {
  const match = FRONTMATTER_RE.exec(text)
  if (!match) return { text, lineOffset: 0 }

  return {
    text: text.slice(match[0].length),
    lineOffset: (match[0].match(/\n/g) ?? []).length
  }
}

function startsWithFrontmatter(lines: SourceLine[]): boolean {
  return lines[0]?.text.trim() === '---'
}

function findTaskMarkers(markdown: string): Map<number, RenderedTaskMarker> {
  const markers = new Map<number, RenderedTaskMarker>()
  const lines = splitLines(markdown)
  let inFrontmatter = startsWithFrontmatter(lines)
  let inFence = false
  let fenceMarker: string | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]?.text ?? ''
    const line = index + 1

    if (inFrontmatter) {
      if (index > 0 && FRONTMATTER_DELIMITER_RE.test(rawLine.trim())) {
        inFrontmatter = false
      }
      continue
    }

    const fence = FENCE_RE.exec(rawLine)
    if (fence) {
      const marker = fence[2]![0]!
      if (!inFence) {
        inFence = true
        fenceMarker = marker
      } else if (fenceMarker === marker) {
        inFence = false
        fenceMarker = null
      }
      continue
    }

    if (inFence) continue

    const task = TASK_RE.exec(rawLine)
    if (!task) continue

    markers.set(line, {
      line,
      checkboxColumn: task[1]!.length,
      checked: task[2]!.toLowerCase() === 'x'
    })
  }

  return markers
}

function renderTaskButton(task: RenderedTaskMarker): string {
  const checked = task.checked ? 'true' : 'false'
  const label = task.checked ? 'Mark task incomplete' : 'Mark task complete'
  return [
    '<span class="markdown-task-line" data-task-checked="',
    checked,
    '">',
    '<button type="button" class="markdown-task-toggle" aria-label="',
    label,
    '" aria-pressed="',
    checked,
    '" data-task-line="',
    String(task.line),
    '" data-task-checkbox-column="',
    String(task.checkboxColumn),
    '" data-task-checked="',
    checked,
    '"></button><span class="markdown-task-content">'
  ].join('')
}

function renderTaskContentClose(): string {
  return '</span></span>'
}

function hasTokenClass(token: Token, className: string): boolean {
  return token.attrGet('class')?.split(/\s+/).includes(className) ?? false
}

function markTaskList(tokens: Token[], listItemOpenIndex: number): void {
  let nestedClosedLists = 0

  for (let index = listItemOpenIndex - 1; index >= 0; index -= 1) {
    const token = tokens[index]
    if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
      nestedClosedLists += 1
      continue
    }
    if (token.type !== 'bullet_list_open' && token.type !== 'ordered_list_open') continue
    if (nestedClosedLists > 0) {
      nestedClosedLists -= 1
      continue
    }

    if (!hasTokenClass(token, 'markdown-task-list')) {
      token.attrJoin('class', 'markdown-task-list')
    }
    return
  }
}

function markTaskListItem(tokens: Token[], inlineIndex: number): void {
  let nestedClosedItems = 0

  for (let index = inlineIndex - 1; index >= 0; index -= 1) {
    const token = tokens[index]
    if (token.type === 'list_item_close') {
      nestedClosedItems += 1
      continue
    }
    if (token.type !== 'list_item_open') continue
    if (nestedClosedItems > 0) {
      nestedClosedItems -= 1
      continue
    }

    token.attrJoin('class', 'markdown-task-item')
    markTaskList(tokens, index)
    return
  }
}

function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'section'
}

function inlineTokenText(token: Token): string {
  if (token.children) {
    return token.children.map(inlineTokenText).join('')
  }

  return token.content
}

async function getMd(): Promise<MarkdownIt> {
  if (!mdPromise) {
    mdPromise = (async () => {
      const highlighter = await createHighlighter({
        themes: ['github-dark', 'github-light-high-contrast'],
        langs: [...PRELOAD_LANGS],
        // Use the pure-JS regex engine — avoids the WebAssembly/CSP restriction
        // in Electron's renderer where script-src 'self' blocks WASM execution.
        engine: createJavaScriptRegexEngine()
      })
      const md = new MarkdownIt({ html: false, linkify: true, typographer: true })
      md.validateLink = isSafeLinkTarget
      const defaultLinkOpen =
        md.renderer.rules.link_open ??
        ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
      md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
        const token = tokens[idx]
        token.attrSet('target', '_blank')
        token.attrSet('rel', 'noreferrer noopener')
        return defaultLinkOpen(tokens, idx, options, env, self)
      }
      md.use(
        fromHighlighter(highlighter, {
          // Dark is written inline; light rides along as a CSS variable the stylesheet switches to
          // when the window is in a light color mode.
          themes: { dark: 'github-dark', light: 'github-light-high-contrast' },
          defaultColor: 'dark',
          // 'markdown' is always in the preload list; unknown langs fall back to it.
          fallbackLanguage: 'markdown'
        })
      )
      const defaultFence =
        md.renderer.rules.fence ??
        ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx]
        const language = token.info.trim().split(/\s+/)[0]?.toLowerCase()
        if (language === MERMAID_LANGUAGE) {
          return renderMermaidFence(token.content)
        }
        return defaultFence(tokens, idx, options, env, self)
      }
      md.core.ruler.after('inline', 'ryte_task_controls', (state) => {
        const env = state.env as RenderEnv
        if (!env.taskMarkers || env.taskMarkers.size === 0) return

        for (let index = 0; index < state.tokens.length; index += 1) {
          const token = state.tokens[index]
          if (token.type !== 'inline') continue
          const sourceLine =
            token.map?.[0] !== undefined ? token.map[0] + (env.lineOffset ?? 0) + 1 : null
          const task = sourceLine ? env.taskMarkers.get(sourceLine) : undefined
          if (!task || !token.children) continue

          const firstTextTokenIndex = token.children.findIndex(
            (child) => child.type === 'text' && TASK_INLINE_MARKER_RE.test(child.content)
          )
          const firstTextToken = token.children[firstTextTokenIndex]
          if (!firstTextToken) continue

          firstTextToken.content = firstTextToken.content.replace(TASK_INLINE_MARKER_RE, '')
          markTaskListItem(state.tokens, index)

          const taskOpen = new state.Token('html_inline', '', 0)
          taskOpen.content = renderTaskButton(task)
          const taskClose = new state.Token('html_inline', '', 0)
          taskClose.content = renderTaskContentClose()
          token.children.splice(firstTextTokenIndex, 0, taskOpen)
          token.children.push(taskClose)
        }
      })
      md.core.ruler.after('inline', 'ryte_heading_ids', (state) => {
        const env = state.env as RenderEnv
        const usedSlugs = new Map<string, number>()

        for (let index = 0; index < state.tokens.length; index += 1) {
          const token = state.tokens[index]
          if (token.type !== 'heading_open') continue

          const inlineToken = state.tokens[index + 1]
          if (!inlineToken || inlineToken.type !== 'inline') continue

          const level = Number(token.tag.slice(1))
          const text = inlineTokenText(inlineToken).replace(/\s+/g, ' ').trim()
          if (!Number.isInteger(level) || level < 1 || level > 6 || !text) continue

          const slug = slugifyHeading(text)
          const count = usedSlugs.get(slug) ?? 0
          usedSlugs.set(slug, count + 1)
          const id = count === 0 ? slug : `${slug}-${count + 1}`

          token.attrSet('id', id)
          env.outline?.push({ id, level, text })
        }
      })
      return md
    })().catch((err) => {
      // Reset so the next render attempt retries rather than caching a rejected promise.
      mdPromise = null
      throw err
    })
  }
  return mdPromise
}

export async function render(text: string, options: RenderOptions = {}): Promise<string> {
  return (await renderDocument(text, options)).html
}

export async function renderDocument(
  text: string,
  options: RenderOptions = {}
): Promise<RenderedMarkdownDocument> {
  const md = await getMd()
  const stripped = stripFrontmatterForRender(text)
  const outline: MarkdownOutlineItem[] = []
  const env: RenderEnv = {
    lineOffset: stripped.lineOffset,
    taskMarkers: options.interactiveTasks ? findTaskMarkers(text) : undefined,
    outline
  }
  return {
    html: sanitizeRenderedHtml(md.render(stripped.text, env)),
    outline
  }
}
