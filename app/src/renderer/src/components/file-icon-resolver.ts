import { supportedKindOf } from '../../../shared/supported-types'

export type FileIconName = 'file' | 'image' | 'code'

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
  const kind = supportedKindOf(fileName)
  if (kind === 'picture') return 'image'
  if (kind === 'code') return 'code'
  return FALLBACK_FILE_ICON
}
