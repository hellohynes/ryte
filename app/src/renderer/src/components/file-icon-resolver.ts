export type FileIconName = 'file'

const FALLBACK_FILE_ICON: FileIconName = 'file'
const FILE_ICON_BY_EXTENSION: Partial<Record<string, FileIconName>> = {}

export function fileExtension(fileName: string): string {
  const baseName = fileName.split('/').pop() ?? fileName
  const extensionStart = baseName.lastIndexOf('.')

  if (extensionStart <= 0 || extensionStart === baseName.length - 1) {
    return ''
  }

  return baseName.slice(extensionStart + 1).toLowerCase()
}

export function resolveFileIconName(fileName: string): FileIconName {
  return FILE_ICON_BY_EXTENSION[fileExtension(fileName)] ?? FALLBACK_FILE_ICON
}
