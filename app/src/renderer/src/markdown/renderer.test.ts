import MarkdownIt from 'markdown-it'
import { describe, expect, it, vi } from 'vitest'

import { render, renderDocument } from './renderer'

describe('render', () => {
  it('should render soft breaks only when requested', async () => {
    const text = 'First line\nSecond line'

    expect((await renderDocument(text, { breaks: true })).html).toBe(
      '<p>First line<br>\nSecond line</p>\n'
    )
    // A soft newline in HTML collapses to a space in the browser.
    expect((await renderDocument(text, { breaks: false })).html).toBe(
      '<p>First line\nSecond line</p>\n'
    )
    expect((await renderDocument(text)).html).toBe('<p>First line\nSecond line</p>\n')
    expect(await render(text)).toBe('<p>First line\nSecond line</p>\n')
  })

  it('should keep concurrent callers soft-break settings independent', async () => {
    const text = 'First\nSecond'
    expect(
      await Promise.all([
        render(text, { breaks: true }),
        render(text),
        render(text, { breaks: false })
      ])
    ).toEqual(['<p>First<br>\nSecond</p>\n', '<p>First\nSecond</p>\n', '<p>First\nSecond</p>\n'])
  })

  it('should restore the shared soft-break setting even when rendering throws', async () => {
    // Initialize the shared renderer before intercepting its synchronous render call.
    await render('Ready')
    let sharedOptions: MarkdownIt['options'] | undefined
    const renderSpy = vi.spyOn(MarkdownIt.prototype, 'render').mockImplementationOnce(function (
      this: MarkdownIt
    ) {
      sharedOptions = this.options
      expect(this.options.breaks).toBe(true)
      throw new Error('Synthetic render failure')
    })

    try {
      await expect(renderDocument('First\nSecond', { breaks: true })).rejects.toThrow(
        'Synthetic render failure'
      )
      expect(sharedOptions?.breaks).toBe(false)
    } finally {
      renderSpy.mockRestore()
    }
    expect(await render('First\nSecond')).toBe('<p>First\nSecond</p>\n')
  })

  it('should render session metadata on three separate lines', async () => {
    const document = await renderDocument(
      '# Session Notes\n\n**Date:** 2026-10-30\n**Source:** Claude Code\n**Project:** demo',
      { breaks: true }
    )

    expect(document.html).toContain(
      '<p><strong>Date:</strong> 2026-10-30<br>\n<strong>Source:</strong> Claude Code<br>\n<strong>Project:</strong> demo</p>'
    )
  })

  it('should preserve paragraph boundaries with soft breaks enabled', async () => {
    expect(await render('First\nSecond\n\nThird\nFourth', { breaks: true })).toBe(
      '<p>First<br>\nSecond</p>\n<p>Third<br>\nFourth</p>\n'
    )
  })

  it.each([
    ['fenced code', '```ts\nconst first = 1\nconst second = 2\n```'],
    ['inline code', '`first\nsecond`'],
    ['tables', '| First | Second |\n| --- | --- |\n| A | B |'],
    ['lists', '- First\n- Second\n\n1. Third\n2. Fourth'],
    ['headings and frontmatter', '---\ntitle: Synthetic\n---\n# Title\n\n## Status\n\n## Status'],
    ['Mermaid', '```mermaid\ngraph TD\n  A --> B\n```']
  ])('should preserve %s with soft breaks enabled', async (_name, text) => {
    expect(await renderDocument(text, { breaks: true })).toEqual(await renderDocument(text))
  })

  it('should break list continuation lines without adding a break before the next item', async () => {
    expect(await render('- First\n  continuation\n- Second', { breaks: true })).toBe(
      '<ul>\n<li>First<br>\ncontinuation</li>\n<li>Second</li>\n</ul>\n'
    )
  })

  it('should retain task source coordinates after frontmatter and multiline content', async () => {
    const text = [
      '---',
      'title: Synthetic tasks',
      '---',
      '# Tasks',
      '',
      'First paragraph line',
      'Second paragraph line',
      '',
      '- [ ] First task',
      '  continuation line',
      '- [x] Second task',
      '  another continuation',
      '',
      'Another paragraph',
      'with a second line',
      '',
      '- [ ] Third task'
    ].join('\n')
    const { html } = await renderDocument(text, { breaks: true, interactiveTasks: true })
    const controls = [
      ...html.matchAll(
        /<button\b[^>]*data-task-line="(\d+)"[^>]*data-task-checkbox-column="(\d+)"[^>]*data-task-checked="(true|false)"[^>]*>/g
      )
    ]

    expect(
      controls.map(([, line, column, checked]) => ({
        line: Number(line),
        column: Number(column),
        checked
      }))
    ).toEqual([
      { line: 9, column: 2, checked: 'false' },
      { line: 11, column: 2, checked: 'true' },
      { line: 17, column: 2, checked: 'false' }
    ])
    for (const [, line, column, checked] of controls) {
      expect(text.split('\n')[Number(line) - 1].slice(Number(column), Number(column) + 3)).toBe(
        checked === 'true' ? '[x]' : '[ ]'
      )
    }
    expect(html).toContain('First paragraph line<br>\nSecond paragraph line')
    expect(html).toContain('First task<br>\ncontinuation line')
    expect(html).not.toContain('title: Synthetic tasks')
  })

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

  it.each([
    [
      'inline code',
      'Before `<img src="a.png">` after',
      '<p>Before <code>&lt;img src=&quot;a.png&quot;&gt;</code> after</p>\n'
    ],
    [
      'an indented block',
      '    indented src="x" onclick="y" code',
      '<pre><code>indented src=&quot;x&quot; onclick=&quot;y&quot; code\n</code></pre>\n'
    ],
    [
      'link titles',
      '[docs](https://example.com "see src=x onclick=y")',
      '<p><a href="https://example.com" title="see src=x onclick=y" target="_blank" rel="noreferrer noopener">docs</a></p>\n'
    ]
  ])('should leave attribute-like text in %s untouched', async (_name, text, expected) => {
    expect(await render(text)).toBe(expected)
  })

  it('should leave attribute-like text in a plain fenced block untouched', async () => {
    const html = await render('```text\nsee src=foo.png and href=bar\n```')
    // Unknown languages are highlighted as one plain span per line.
    expect(html).toMatch(
      /<span class="line"><span [^>]*>see src=foo\.png and href=bar<\/span><\/span>/
    )
  })

  describe('pictures in notes', () => {
    const notePath = 'journal/2026/today.md'
    const pictureSrc = (html: string): string | undefined => /<img src="([^"]*)"/.exec(html)?.[1]

    it.each([
      ['the same folder', 'a.png', 'ryte-file://notes/journal/2026/a.png'],
      ['a dot path', './a.png', 'ryte-file://notes/journal/2026/a.png'],
      ['a subfolder', 'images/a.png', 'ryte-file://notes/journal/2026/images/a.png'],
      ['a parent folder', '../shared/a.png', 'ryte-file://notes/journal/shared/a.png'],
      ['the notes folder root', '/assets/a.png', 'ryte-file://notes/assets/a.png'],
      ['spaces in angle brackets', '<my pic.png>', 'ryte-file://notes/journal/2026/my%20pic.png'],
      ['accents', '<déjà vu.png>', 'ryte-file://notes/journal/2026/d%C3%A9j%C3%A0%20vu.png'],
      ['an uppercase extension', 'SHOT.PNG', 'ryte-file://notes/journal/2026/SHOT.PNG']
    ])('should resolve a picture in %s inside the notes folder', async (_name, target, src) => {
      expect(pictureSrc(await render(`![alt](${target})`, { notePath }))).toBe(src)
    })

    it.each([
      ['leaves the notes folder', '../../../outside.png', notePath],
      ['has a backslash', 'images%5Ca.png', notePath],
      ['belongs to a note outside the notes folder', 'a.png', undefined]
    ])('should show a quiet notice for a picture that %s', async (_name, target, path) => {
      const html = await render(`![alt](${target})`, { notePath: path })
      expect(html).toContain('data-note-picture-notice="unresolved"')
      expect(html).toContain('<span class="note-picture-notice-alt">alt</span>')
      expect(html).not.toContain('<img')
    })

    it('should load pictures lazily and keep their description and title', async () => {
      expect(await render('![A *bold* shot](a.png "Title")', { notePath })).toBe(
        '<p><button type="button" class="note-picture-button" aria-label="Open picture: A bold shot" data-note-picture-index="0">' +
          '<img src="ryte-file://notes/journal/2026/a.png" alt="A bold shot" title="Title" loading="lazy" decoding="async">' +
          '</button></p>\n'
      )
    })

    it('should number lightbox pictures in reading order, skipping linked and unsupported ones', async () => {
      const html = await render(
        '![one](1.png) [![linked](2.png)](https://example.com)\n\n![phone](3.heic)\n\n- ![two](4.png)\n- ![three](5.png)',
        { notePath }
      )
      expect(
        [...html.matchAll(/data-note-picture-index="(\d+)"><img src="[^"]*\/(\d)\.png"/g)].map(
          ([, index, file]) => [Number(index), file]
        )
      ).toEqual([
        [0, '1'],
        [1, '4'],
        [2, '5']
      ])
    })

    it('should show a notice instead of requesting a type Ryte cannot show', async () => {
      expect(await render('![Phone photo](IMG_1.HEIC)', { notePath })).toBe(
        '<p><span class="note-picture-notice" data-note-picture-notice="unsupported">' +
          '<span class="note-picture-notice-alt">Phone photo</span>' +
          `<span class="note-picture-notice-detail">Ryte can't show .heic pictures yet.</span></span></p>\n`
      )
    })

    it('should keep relative links as plain text', async () => {
      expect(await render('[other note](other.md)', { notePath })).toBe(
        '<p>[other note](other.md)</p>\n'
      )
    })

    it('should keep a picture inside a link a link', async () => {
      expect(await render('[![alt](a.png)](https://example.com)', { notePath })).toBe(
        '<p><a href="https://example.com" target="_blank" rel="noreferrer noopener">' +
          '<img src="ryte-file://notes/journal/2026/a.png" alt="alt" loading="lazy" decoding="async"></a></p>\n'
      )
    })
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
