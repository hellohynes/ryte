import { existsSync, statSync } from 'node:fs'

const requiredVariables = [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'APPLE_API_KEY',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER'
]

const missingVariables = requiredVariables.filter((name) => !process.env[name]?.trim())
if (missingVariables.length > 0) {
  console.error(
    `A notarized Ryte release requires: ${missingVariables.join(', ')}. See docs/releasing-macos.md.`
  )
  process.exit(1)
}

const apiKeyPath = process.env.APPLE_API_KEY
const hasApiKey =
  apiKeyPath &&
  existsSync(apiKeyPath) &&
  statSync(apiKeyPath).isFile() &&
  statSync(apiKeyPath).size > 0
if (!hasApiKey) {
  console.error('APPLE_API_KEY must be the path to an App Store Connect API key .p8 file.')
  process.exit(1)
}

console.log('Release signing and notarization credentials are configured.')
