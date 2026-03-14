import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.{ts,tsx,js,jsx}'],
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
      react: resolve(rootDir, 'apps/sanity-data-sdk/node_modules/react'),
      'react-dom': resolve(rootDir, 'apps/sanity-data-sdk/node_modules/react-dom'),
      'react/jsx-runtime': resolve(rootDir, 'apps/sanity-data-sdk/node_modules/react/jsx-runtime.js'),
    },
  },
});
