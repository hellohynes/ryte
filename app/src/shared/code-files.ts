/**
 * Code files Ryte shows in a read-only code view. The language is a plain id, so `shared/` stays free of
 * CodeMirror; the renderer maps each id to a lazily loaded language.
 */
export type CodeLanguageId =
  | 'json'
  | 'javascript'
  | 'jsx'
  | 'typescript'
  | 'tsx'
  | 'css'
  | 'yaml'
  | 'shell'

/** Larger code files are not shown; the tab offers to open them in the default app instead. */
export const MAX_CODE_FILE_BYTES = 10 * 1024 * 1024

const CODE_LANGUAGE_BY_EXTENSION: Readonly<Record<string, CodeLanguageId>> = {
  json: 'json',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  css: 'css',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'shell'
}

/**
 * Types the default app is never asked to open. A shell script can run in Terminal when that is the app
 * registered for it, the same reason SVG is left out for pictures.
 */
const CODE_EXTENSIONS_NOT_OPENED: ReadonlySet<string> = new Set(['sh'])

/** The lowercased extension of the last path segment (either separator), without the dot, or '' when there is none. */
export function codeFileExtension(path: string): string {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function isCodeExtension(extension: string): boolean {
  return Object.hasOwn(CODE_LANGUAGE_BY_EXTENSION, extension)
}

/** The language id for a file name by its extension (any letter case), or null when it is not a code file. */
export function codeLanguageOf(path: string): CodeLanguageId | null {
  const extension = codeFileExtension(path)
  return isCodeExtension(extension) ? CODE_LANGUAGE_BY_EXTENSION[extension]! : null
}

/** Whether a code file of this extension may be handed to the default app. */
export function canOpenCodeExtension(extension: string): boolean {
  return isCodeExtension(extension) && !CODE_EXTENSIONS_NOT_OPENED.has(extension)
}
