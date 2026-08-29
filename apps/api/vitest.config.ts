import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    // Integration tests create a database and run migrations before the
    // first assertion. The default 5s hook timeout isn't enough for that on a
    // cold CI runner.
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Entry points and CLI files are just process glue. Running the stack
      // covers them, and unit testing them would mostly test Node.
      exclude: ['src/server.ts', 'src/cli/**'],
    },
  },
})
