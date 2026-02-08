import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.{ts,js}'],
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'src/lib/**', 'src/utils/**'],
      reporter: ['text', 'html'],
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@shared': './shared',
    },
  },
});
