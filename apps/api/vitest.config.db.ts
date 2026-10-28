import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    include: ['test/**/*.db-spec.ts'],
    hookTimeout: 60000,
    testTimeout: 15000,
    fileParallelism: false,
  },
});
