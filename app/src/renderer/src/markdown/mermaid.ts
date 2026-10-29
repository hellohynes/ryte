import type mermaidApi from 'mermaid'

type MermaidApi = typeof mermaidApi
type MermaidTheme = 'dark' | 'default'

/** Diagrams are drawn for the window's current color mode. */
function currentFont(): string {
  const stack =
    typeof document === 'undefined'
      ? ''
      : getComputedStyle(document.documentElement).getPropertyValue('--st-font-sans').trim()
  return stack || 'Geist, Inter, system-ui, -apple-system, sans-serif'
}

function currentTheme(): MermaidTheme {
  const query =
    typeof window === 'undefined' ? undefined : window.matchMedia?.('(prefers-color-scheme: dark)')
  return query?.matches === false ? 'default' : 'dark'
}

let mermaidPromise: Promise<MermaidApi> | null = null
let initializedKey: string | null = null
let renderCount = 0

async function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => mod.default)
  }
  return mermaidPromise
}

async function initializeMermaid(): Promise<MermaidApi> {
  const mermaid = await loadMermaid()
  const theme = currentTheme()
  const fontFamily = currentFont()
  const key = `${theme}|${fontFamily}`
  if (initializedKey === key) return mermaid

  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme, fontFamily })
  initializedKey = key
  return mermaid
}

function diagramSource(node: HTMLElement): string {
  return node.textContent?.trim() ?? ''
}

function showRenderError(node: HTMLElement, source: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  const label = document.createElement('span')
  label.className = 'mermaid-error-label'
  label.textContent = 'Could not render Mermaid diagram.'

  const detail = document.createElement('code')
  detail.className = 'mermaid-error-detail'
  detail.textContent = message

  const sourceBlock = document.createElement('code')
  sourceBlock.className = 'mermaid-error-source'
  sourceBlock.textContent = source

  node.replaceChildren(label, detail, sourceBlock)
  node.setAttribute('data-mermaid-error', 'true')
}

export async function renderMermaidDiagrams(root: HTMLElement): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('pre.mermaid:not([data-processed])'))
  if (nodes.length === 0) return

  const mermaid = await initializeMermaid()

  for (const node of nodes) {
    const source = diagramSource(node)
    if (!source) continue

    node.setAttribute('data-processed', 'true')
    node.removeAttribute('data-mermaid-pending')
    node.removeAttribute('data-mermaid-error')

    try {
      const id = `ryte-mermaid-${++renderCount}`
      const { svg, bindFunctions } = await mermaid.render(id, source, node)
      if (!root.contains(node)) continue
      node.innerHTML = svg
      bindFunctions?.(node)
    } catch (error) {
      if (root.contains(node)) {
        showRenderError(node, source, error)
      }
    }
  }
}
