import type { Extension } from '@codemirror/state'

import type { CodeLanguageId } from '../../../shared/code-files'

/**
 * Loads the CodeMirror support for one language. Each import is its own chunk, fetched only when a file of that
 * language opens; `javascript`, `jsx`, `typescript` and `tsx` share one.
 */
export async function loadCodeLanguage(id: CodeLanguageId): Promise<Extension> {
  switch (id) {
    case 'json':
      return (await import('@codemirror/lang-json')).json()
    case 'javascript':
      return (await import('@codemirror/lang-javascript')).javascript()
    case 'jsx':
      return (await import('@codemirror/lang-javascript')).javascript({ jsx: true })
    case 'typescript':
      return (await import('@codemirror/lang-javascript')).javascript({ typescript: true })
    case 'tsx':
      return (await import('@codemirror/lang-javascript')).javascript({
        jsx: true,
        typescript: true
      })
    case 'css':
      return (await import('@codemirror/lang-css')).css()
    case 'yaml':
      return (await import('@codemirror/lang-yaml')).yaml()
    case 'shell': {
      const [{ StreamLanguage }, { shell }] = await Promise.all([
        import('@codemirror/language'),
        import('@codemirror/legacy-modes/mode/shell')
      ])
      return StreamLanguage.define(shell)
    }
  }
}
