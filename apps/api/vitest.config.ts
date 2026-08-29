import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    // Integration tests create a database and run migrations before their
    // first assertion; the default 5s hook timeout is not enough for that on
    // a cold CI runner.
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Entry points and CLI wrappers are process glue: they are covered by
      // actually running the stack, and unit-testing them would test Node.
      exclude: ['src/server.ts', 'src/cli/**'],
    },
  },
})
