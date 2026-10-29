import mermaid from 'mermaid'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderMermaidDiagrams } from './mermaid'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn()
  }
}))

function createMermaidNode(source: string): HTMLElement {
  const attributes = new Map<string, string>()
  return {
    textContent: source,
    innerHTML: source,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name)
  } as unknown as HTMLElement
}

function createRoot(nodes: HTMLElement[]): HTMLElement {
  return {
    querySelectorAll: vi.fn(() => nodes),
    contains: vi.fn((node: HTMLElement) => nodes.includes(node))
  } as unknown as HTMLElement
}

function setColorScheme(dark: boolean): void {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: dark }) })
}

describe('renderMermaidDiagrams', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.mocked(mermaid.initialize).mockClear()
  })

  it('should initialize Mermaid and render pending diagram nodes', async () => {
    const bindFunctions = vi.fn()
    vi.mocked(mermaid.render).mockResolvedValue({
      diagramType: 'flowchart-v2',
      svg: '<svg role="img"></svg>',
      bindFunctions
    })
    const node = createMermaidNode('graph TD\n  A --> B')

    await renderMermaidDiagrams(createRoot([node]))

    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'dark'
      })
    )
    expect(mermaid.render).toHaveBeenCalledWith(
      expect.stringMatching(/^ryte-mermaid-\d+$/),
      'graph TD\n  A --> B',
      node
    )
    expect(node.innerHTML).toBe('<svg role="img"></svg>')
    expect(bindFunctions).toHaveBeenCalledWith(node)
  })

  it("draws diagrams for the window's color mode, and again when the mode changes", async () => {
    vi.mocked(mermaid.render).mockResolvedValue({
      diagramType: 'flowchart-v2',
      svg: '<svg></svg>',
      bindFunctions: undefined
    })

    setColorScheme(false)
    await renderMermaidDiagrams(createRoot([createMermaidNode('graph TD\n  A --> B')]))
    expect(mermaid.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: 'default' })
    )

    setColorScheme(true)
    await renderMermaidDiagrams(createRoot([createMermaidNode('graph TD\n  C --> D')]))
    expect(mermaid.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }))
  })
})
