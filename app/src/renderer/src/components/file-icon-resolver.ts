import { supportedKindOf } from '../../../shared/supported-types'

export type FileIconName = 'file' | 'image'

const FALLBACK_FILE_ICON: FileIconName = 'file'

export function fileExtension(fileName: string): string {
  const baseName = fileName.split('/').pop() ?? fileName
  const extensionStart = baseName.lastIndexOf('.')

  if (extensionStart <= 0 || extensionStart === baseName.length - 1) {
    return ''
  }

  return baseName.slice(extensionStart + 1).toLowerCase()
}

export function resolveFileIconName(fileName: string): FileIconName {
  return supportedKindOf(fileName) === 'picture' ? 'image' : FALLBACK_FILE_ICON
}
