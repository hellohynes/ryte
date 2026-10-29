import { describe, expect, it } from 'vitest'

import { resolveSQLiteVecLoadablePath } from './sqlite-vec-path'

describe('resolveSQLiteVecLoadablePath', () => {
  it('loads the native extension from app.asar.unpacked in a packaged macOS app', () => {
    expect(
      resolveSQLiteVecLoadablePath(
        '/Applications/ryte.app/Contents/Resources/app.asar/node_modules/sqlite-vec-darwin-arm64/vec0.dylib'
      )
    ).toBe(
      '/Applications/ryte.app/Contents/Resources/app.asar.unpacked/node_modules/sqlite-vec-darwin-arm64/vec0.dylib'
    )
  })

  it('normalizes Electron’s duplicated dylib suffix before loading from the unpacked app', () => {
    expect(
      resolveSQLiteVecLoadablePath(
        '/Applications/ryte.app/Contents/Resources/app.asar/node_modules/sqlite-vec-darwin-arm64/vec0.dylib.dylib'
      )
    ).toBe(
      '/Applications/ryte.app/Contents/Resources/app.asar.unpacked/node_modules/sqlite-vec-darwin-arm64/vec0.dylib'
    )
  })

  it('preserves development and other non-asar paths', () => {
    expect(
      resolveSQLiteVecLoadablePath('/workspace/node_modules/sqlite-vec-darwin-arm64/vec0.dylib')
    ).toBe('/workspace/node_modules/sqlite-vec-darwin-arm64/vec0.dylib')
  })
})
