import type { Extension } from '@codemirror/state'

import type { CodeLanguageId } from '../../../shared/code-files'
import { loadCodeLanguage } from './code-editor-languages'

export interface CodeEditorHandle {
  /** Shows new text for the same file, keeping the scroll position. */
  update: (next: { text: string; language: CodeLanguageId | null }) => Promise<void>
  destroy: () => void
}

/**
 * Shows `text` in a read-only code view inside `host`. CodeMirror and the language load on the first call, as
 * chunks of their own; a language that fails to load shows the text uncolored.
 */
export async function openCodeEditor(
  host: HTMLElement,
  options: {
    text: string
    language: CodeLanguageId | null
    label: string
    /** Called when the fold-all key can't work because the file is too big to be fully parsed. */
    onFoldAllUnavailable?: () => void
  }
): Promise<CodeEditorHandle> {
  const [core, language] = await Promise.all([
    import('./code-editor-core'),
    options.language === null
      ? Promise.resolve(null)
      : loadCodeLanguage(options.language).catch(() => null)
  ])
  const editor = core.createCodeEditorView(host, {
    text: options.text,
    language,
    label: options.label,
    onFoldAllUnavailable: options.onFoldAllUnavailable
  })
  let shownLanguage = options.language
  let destroyed = false

  return {
    update: async (next) => {
      let extension: Extension | null | undefined
      if (next.language !== shownLanguage) {
        extension =
          next.language === null ? null : await loadCodeLanguage(next.language).catch(() => null)
        shownLanguage = next.language
      }
      if (!destroyed) core.replaceCodeText(editor, next.text, extension)
    },
    destroy: () => {
      destroyed = true
      editor.view.destroy()
    }
  }
}
