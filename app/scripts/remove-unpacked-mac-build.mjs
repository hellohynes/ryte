import { existsSync, rmSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const distDir = resolve('dist')
const unpackedAppDir = resolve(distDir, 'mac-arm64')
const relativePath = relative(distDir, unpackedAppDir)

if (!relativePath || relativePath.startsWith('..')) {
  throw new Error(`Refusing to remove an unexpected unpacked app path: ${unpackedAppDir}`)
}

if (existsSync(unpackedAppDir)) {
  rmSync(unpackedAppDir, { recursive: true, force: true })
  console.log(`Removed generated unpacked app: ${unpackedAppDir}`)
}
