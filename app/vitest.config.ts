import { defineConfig } from 'vitest/config'

// These test files require better-sqlite3 compiled for the current Node ABI.
// better-sqlite3 is compiled for the Electron ABI, so these tests fail under plain Node with an
// ABI mismatch. `pnpm test:native` runs them under Electron's Node (vitest.native.config.mjs), and
// `pnpm validate` includes it. `pnpm smoke:indexer` also exercises the native pipeline.
const NATIVE_TESTS = [
  'src/main/indexing/vector-store.test.ts',
  'src/main/indexing/index-state.test.ts',
  'src/main/indexing/indexer.test.ts',
  'src/main/indexing/indexer-service.native.test.ts'
]

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: NATIVE_TESTS,
    environment: 'node',
    globals: false,
    reporters: ['default']
  }
})
