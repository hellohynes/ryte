import { defineConfig } from 'vitest/config'

// The test files vitest.config.ts leaves out: they open a real SQLite index, and better-sqlite3 is built for the Electron ABI.
// `pnpm test:native` runs them under Electron's own Node (scripts/test-native.mjs), so no rebuild is needed.
export default defineConfig({
  test: {
    include: [
      'src/main/indexing/vector-store.test.ts',
      'src/main/indexing/index-state.test.ts',
      'src/main/indexing/indexer.test.ts'
    ],
    environment: 'node',
    globals: false,
    reporters: ['default']
  }
})
