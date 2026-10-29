import { describe, expect, it } from 'vitest'

import { render, renderDocument } from './renderer'

describe('render', () => {
  it('should render a heading and paragraph', async () => {
    const html = await render('# Hello\n\nWorld')
    expect(html).toContain('<h1 id="hello">Hello</h1>')
    expect(html).toContain('<p>World</p>')
  })

  it('should expose a document outline from headings', async () => {
    const document = await renderDocument('# Title\n\n## Status\n\n### Detail\n\n## Status')

    expect(document.html).toContain('<h1 id="title">Title</h1>')
    expect(document.html).toContain('<h2 id="status">Status</h2>')
    expect(document.html).toContain('<h3 id="detail">Detail</h3>')
    expect(document.html).toContain('<h2 id="status-2">Status</h2>')
    expect(document.outline).toEqual([
      { id: 'title', level: 1, text: 'Title' },
      { id: 'status', level: 2, text: 'Status' },
      { id: 'detail', level: 3, text: 'Detail' },
      { id: 'status-2', level: 2, text: 'Status' }
    ])
  })

  it('should syntax-highlight fenced code blocks', async () => {
    const html = await render('```ts\nconst x: number = 1\n```')
    // Shiki wraps code in <pre class="shiki ..."><code>...</code></pre>
    // with span elements carrying inline color styles for each token.
    expect(html).toContain('shiki')
    expect(html).toMatch(/<span style="color:/)
  })

  it('should render Mermaid fences as diagram placeholders', async () => {
    const html = await render('```mermaid\ngraph TD\n  A --> B\n```')
    expect(html).toContain('<pre class="mermaid" data-mermaid-pending="true">')
    expect(html).toContain('graph TD')
    expect(html).toContain('A --&gt; B')
    expect(html).not.toContain('shiki')
  })

  it('should escape Mermaid source before viewer hydration', async () => {
    const html = await render('```mermaid\ngraph TD\n  A["<script>"] --> B\n```')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('should strip YAML frontmatter before rendering', async () => {
    const html = await render('---\nfoo: bar\n---\n# H')
    expect(html).toContain('<h1 id="h">H</h1>')
    expect(html).not.toContain('foo: bar')
  })

  it('should leave content without frontmatter untouched', async () => {
    const html = await render('---\n\nnot frontmatter')
    // A standalone `---` followed by a paragraph is a horizontal rule per CommonMark.
    expect(html).toContain('<hr>')
    expect(html).toContain('<p>not frontmatter</p>')
  })

  it('should fall back gracefully on unknown code-block languages', async () => {
    const html = await render('```madeuplang\nfoo bar\n```')
    expect(html).toContain('foo bar')
  })

  it('should linkify URLs', async () => {
    const html = await render('See https://example.com')
    expect(html).toContain('<a href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer noopener"')
  })

  it('should not render raw HTML as executable markup', async () => {
    const html = await render('<img src=x onerror="alert(1)">')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('should strip unsafe markdown link targets', async () => {
    const html = await render('[bad](javascript:alert(1)) [file](file:///tmp/private.md)')
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain('href="file:')
  })

  it('should preserve Shiki highlighting after sanitization', async () => {
    const html = await render('```ts\nconst x = 1\n```')
    expect(html).toContain('shiki')
    expect(html).toMatch(/<span style="color:/)
  })

  it('should keep markdown tasks non-interactive by default', async () => {
    const html = await render('- [ ] Follow up')

    expect(html).not.toContain('markdown-task-toggle')
    expect(html).toContain('[ ] Follow up')
  })

  it('should render task markers as interactive controls when requested', async () => {
    const html = await render('- [ ] Follow up\n- [x] Done', { interactiveTasks: true })

    expect(html).toContain('<ul class="markdown-task-list">')
    expect(html).toContain('<li class="markdown-task-item">')
    expect(html).toContain('class="markdown-task-toggle"')
    expect(html).toContain('class="markdown-task-content"')
    expect(html).toContain('data-task-line="1"')
    expect(html).toContain('data-task-checkbox-column="2"')
    expect(html).toContain('data-task-checked="false"')
    expect(html).toContain('aria-label="Mark task complete"')
    expect(html).toContain('data-task-line="2"')
    expect(html).toContain('data-task-checked="true"')
    expect(html).toContain('aria-label="Mark task incomplete"')
    expect(html).not.toContain('[ ] Follow up')
    expect(html).not.toContain('[x] Done')
  })

  it('should preserve original source line numbers after frontmatter', async () => {
    const html = await render('---\ntitle: Tasks\n---\n- [ ] Follow up', {
      interactiveTasks: true
    })

    expect(html).toContain('data-task-line="4"')
  })

  it('should not render task controls inside fenced code', async () => {
    const html = await render('```\n- [ ] Not a task\n```\n\n- [ ] Real task', {
      interactiveTasks: true
    })

    expect(html).not.toContain('data-task-line="2"')
    expect(html).toContain('data-task-line="5"')
    expect(html.match(/markdown-task-toggle/g)).toHaveLength(1)
  })
})
