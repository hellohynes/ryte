import { safeStorage } from 'electron'

/**
 * Wraps Electron's safeStorage, which backs onto the macOS Keychain.
 * Returns null if encryption is unavailable on the platform.
 */
export class Keychain {
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  encrypt(value: string): string | null {
    if (!this.isAvailable()) return null
    return safeStorage.encryptString(value).toString('base64')
  }

  decrypt(encoded: string): string | null {
    if (!this.isAvailable()) return null
    try {
      return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
    } catch {
      return null
    }
  }
}

export const keychain = new Keychain()
