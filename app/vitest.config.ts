import { defineConfig } from 'vitest/config'

// These test files require better-sqlite3 compiled for the current Node ABI.
// When pnpm dev is the active workflow, better-sqlite3 is compiled for Electron
// and these tests fail with ABI mismatch. Correctness is validated by:
//   pnpm smoke:indexer                       (native pipeline, fake embedder)
//   TS-001 E2E                                (real Electron, real OpenAI)
const NATIVE_TESTS = [
  'src/main/indexing/vector-store.test.ts',
  'src/main/indexing/index-state.test.ts',
  'src/main/indexing/indexer.test.ts'
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
