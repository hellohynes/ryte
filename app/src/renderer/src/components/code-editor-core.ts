import { defaultKeymap } from '@codemirror/commands'
import {
  HighlightStyle,
  codeFolding,
  foldAll,
  foldGutter,
  foldKeymap,
  language as languageFacet,
  syntaxHighlighting,
  syntaxTreeAvailable
} from '@codemirror/language'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, drawSelection, keymap, lineNumbers, type KeyBinding } from '@codemirror/view'
import { tags } from '@lezer/highlight'

/**
 * Everything that makes the read-only code view: the one chunk the view needs whatever the language. Colors come
 * from Stencil tokens, which already follow the light and dark theme, so there is no separate dark theme.
 */

const highlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword],
    color: 'var(--st-color-accent)'
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp],
    color: 'var(--st-color-success-strong)'
  },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--st-color-warning)' },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: 'var(--st-color-text-tertiary)',
    fontStyle: 'italic'
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.propertyName],
    color: 'var(--st-color-info-strong)'
  },
  {
    tag: [tags.typeName, tags.className, tags.tagName, tags.definition(tags.typeName)],
    color: 'var(--st-color-link-strong)'
  },
  { tag: [tags.attributeName, tags.labelName, tags.namespace], color: 'var(--st-color-info)' },
  {
    tag: [tags.punctuation, tags.separator, tags.bracket, tags.operator],
    color: 'var(--st-color-text-secondary)'
  },
  {
    tag: tags.heading,
    color: 'var(--st-color-text-strong)',
    fontWeight: 'var(--st-font-weight-semi-bold)'
  },
  { tag: tags.link, color: 'var(--st-color-link)', textDecoration: 'underline' },
  { tag: tags.invalid, color: 'var(--st-color-danger)' }
])

const theme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--st-color-text-primary)',
    backgroundColor: 'transparent',
    fontSize: 'var(--st-type-code-md-size)'
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--st-type-code-md-family)',
    lineHeight: 'var(--st-type-code-md-leading)',
    overflow: 'auto'
  },
  '.cm-content': { padding: 'var(--st-space-100) 0', caretColor: 'transparent' },
  '.cm-line': { padding: '0 var(--st-space-200)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'transparent' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--st-color-text-tertiary)',
    border: 'none',
    borderRight: 'var(--st-border-100) solid var(--st-color-border-subtle)'
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 var(--st-space-150) 0 var(--st-space-200)' },
  '.cm-foldGutter .cm-gutterElement': {
    padding: '0 var(--st-space-75)',
    cursor: 'pointer',
    color: 'var(--st-color-text-muted)'
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--st-color-surface-sunken)',
    border: 'var(--st-border-100) solid var(--st-color-border-base)',
    color: 'var(--st-color-text-muted)',
    borderRadius: 'var(--st-space-50)',
    padding: '0 var(--st-space-75)'
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'var(--st-color-surface-selected)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--st-color-surface-hover)' },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in oklab, var(--st-color-warning) 25%, transparent)',
    outline: 'var(--st-border-100) solid var(--st-color-warning)'
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in oklab, var(--st-color-warning) 45%, transparent)'
  },
  '.cm-panels': {
    backgroundColor: 'var(--st-color-surface-raised)',
    color: 'var(--st-color-text-primary)',
    borderBottom: 'var(--st-border-100) solid var(--st-color-border-subtle)'
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: 'var(--st-border-100) solid var(--st-color-border-subtle)'
  },
  '.cm-search': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 'var(--st-space-75)',
    padding: 'var(--st-space-75) var(--st-space-150)',
    fontSize: 'var(--st-type-body-sm-size)'
  },
  '.cm-search label': { display: 'inline-flex', alignItems: 'center', gap: 'var(--st-space-50)' },
  '.cm-search .cm-textfield': {
    backgroundColor: 'var(--st-color-surface-base)',
    color: 'var(--st-color-text-primary)',
    border: 'var(--st-border-100) solid var(--st-color-border-base)',
    borderRadius: 'var(--st-space-50)',
    padding: 'var(--st-space-50) var(--st-space-75)',
    margin: '0'
  },
  '.cm-search .cm-textfield:focus-visible': {
    outline: 'var(--st-border-200) solid var(--st-color-focus)',
    outlineOffset: 'var(--st-space-25)'
  },
  '.cm-search .cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--st-color-surface-base)',
    color: 'var(--st-color-text-primary)',
    border: 'var(--st-border-100) solid var(--st-color-border-base)',
    borderRadius: 'var(--st-space-50)',
    padding: 'var(--st-space-25) var(--st-space-100)',
    cursor: 'pointer'
  },
  '.cm-search .cm-button:hover': { backgroundColor: 'var(--st-color-surface-hover)' },
  '.cm-search .cm-button:focus-visible': {
    outline: 'var(--st-border-200) solid var(--st-color-focus)',
    outlineOffset: 'var(--st-space-25)'
  },
  '.cm-search [name=close]': {
    position: 'static',
    background: 'transparent',
    border: 'none',
    color: 'var(--st-color-text-muted)',
    cursor: 'pointer',
    font: 'inherit',
    marginLeft: 'auto'
  }
})

export interface CodeEditorOptions {
  text: string
  /** The language support to color with, or null for plain text. */
  language: Extension | null
  /** Names the text for assistive technology. */
  label: string
  /** Called when the fold-all key does nothing because the file is too big to be fully parsed. */
  onFoldAllUnavailable?: () => void
}

/**
 * The fold keys, with fold-all checking first that the whole file is parsed. On a big file the parser stops
 * ahead of the end, so fold-all would silently fold nothing; the caller is told instead. A file with no
 * language has nothing to fold and is left alone.
 */
function foldKeys(onFoldAllUnavailable: (() => void) | undefined): readonly KeyBinding[] {
  return foldKeymap.map((binding) =>
    binding.run === foldAll
      ? {
          ...binding,
          run: (view: EditorView): boolean => {
            const { state } = view
            if (state.facet(languageFacet) && !syntaxTreeAvailable(state, state.doc.length)) {
              onFoldAllUnavailable?.()
              return true
            }
            return foldAll(view)
          }
        }
      : binding
  )
}

export interface CodeEditor {
  view: EditorView
  /** Holds the language support, so a file that changes language is recolored without a new view. */
  language: Compartment
}

/**
 * A read-only, focusable CodeMirror view in `host`: line numbers, a fold gutter with the fold keys, find (⌘F)
 * and selection and copy. It is read-only through the state, not by turning editing off, so the text can still
 * take focus.
 */
export function createCodeEditorView(host: HTMLElement, options: CodeEditorOptions): CodeEditor {
  const language = new Compartment()
  const extensions: Extension[] = [
    EditorState.readOnly.of(true),
    lineNumbers(),
    foldGutter(),
    codeFolding(),
    drawSelection(),
    highlightSelectionMatches(),
    search({ top: true }),
    syntaxHighlighting(highlightStyle),
    keymap.of([...defaultKeymap, ...searchKeymap, ...foldKeys(options.onFoldAllUnavailable)]),
    EditorView.contentAttributes.of({ 'aria-label': options.label, 'aria-readonly': 'true' }),
    theme,
    language.of(options.language ?? [])
  ]

  const view = new EditorView({
    parent: host,
    state: EditorState.create({ doc: options.text, extensions })
  })
  view.scrollDOM.classList.add('ryte-scrollbar')
  return { view, language }
}

/**
 * Shows new text for the same file. Only the part that differs is replaced, so the scroll position, the folds and
 * the selection outside it stay. `language` undefined keeps the current language; null shows plain text.
 */
export function replaceCodeText(
  editor: CodeEditor,
  text: string,
  language?: Extension | null
): void {
  const { view } = editor
  const previous = view.state.doc.toString()
  let start = 0
  const shortest = Math.min(previous.length, text.length)
  while (start < shortest && previous.charCodeAt(start) === text.charCodeAt(start)) start += 1
  let previousEnd = previous.length
  let textEnd = text.length
  while (
    previousEnd > start &&
    textEnd > start &&
    previous.charCodeAt(previousEnd - 1) === text.charCodeAt(textEnd - 1)
  ) {
    previousEnd -= 1
    textEnd -= 1
  }

  const { scrollTop, scrollLeft } = view.scrollDOM
  view.dispatch({
    changes: { from: start, to: previousEnd, insert: text.slice(start, textEnd) },
    effects: language === undefined ? [] : editor.language.reconfigure(language ?? [])
  })
  view.scrollDOM.scrollTop = scrollTop
  view.scrollDOM.scrollLeft = scrollLeft
}
