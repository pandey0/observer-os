import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@observer-os/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@observer-os/sdk': resolve(__dirname, '../../packages/sdk/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
